import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockOrgFindMany,
	mockFollowFindMany,
	mockMemberFindMany,
	mockHorseFindMany,
	mockSyncCircleSpaceMembership,
	mockLoggerInfo,
	mockLoggerWarn,
} = vi.hoisted(() => ({
	mockOrgFindMany: vi.fn(),
	mockFollowFindMany: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockHorseFindMany: vi.fn(),
	mockSyncCircleSpaceMembership: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findMany: mockOrgFindMany },
		horseFollow: { findMany: mockFollowFindMany },
		member: { findMany: mockMemberFindMany },
		horse: { findMany: mockHorseFindMany },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));

vi.mock("@repo/payments/lib/circle-space-membership", () => ({
	syncCircleSpaceMembership: mockSyncCircleSpaceMembership,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: vi.fn() },
}));

import { reconcileSpaceMemberships } from "../reconcile-space-memberships";

/** A member/horse pair that clears the pre-filter — join is attempted. */
const PROVISIONED_MEMBER = (userId: string) => ({ userId, circleMemberId: `cm-${userId}` });
const ACTIVE_HORSE = (id: string) => ({ id, circleSpaceId: `space-${id}`, circleSpaceStatus: "active" });

beforeEach(() => {
	vi.clearAllMocks();
	mockSyncCircleSpaceMembership.mockResolvedValue({ ok: true });
	// Default: every follow's member + horse clears the pre-filter, matching
	// the pre-existing tests' assumption that follows are attempted.
	mockMemberFindMany.mockResolvedValue([PROVISIONED_MEMBER("u-1"), PROVISIONED_MEMBER("u-2")]);
	mockHorseFindMany.mockResolvedValue([ACTIVE_HORSE("h-1")]);
});

describe("reconcileSpaceMemberships", () => {
	it("re-asserts a join for every HorseFollow row and returns a summary", async () => {
		mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
		mockFollowFindMany.mockResolvedValue([
			{ userId: "u-1", horseId: "h-1" },
			{ userId: "u-2", horseId: "h-1" },
		]);

		const summary = await reconcileSpaceMemberships();

		expect(mockSyncCircleSpaceMembership).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "u-1",
			horseId: "h-1",
			action: "join",
		});
		expect(mockSyncCircleSpaceMembership).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "u-2",
			horseId: "h-1",
			action: "join",
		});
		expect(summary).toEqual({
			orgsProcessed: 1,
			orgsSkippedDisabled: 0,
			totalFollows: 2,
			skipped: 0,
			joined: 2,
			failed: 0,
		});
		expect(mockLoggerInfo).toHaveBeenCalledWith(
			"[Circle] Space membership reconcile summary",
			expect.objectContaining(summary),
		);
	});

	it("counts failed joins without throwing", async () => {
		mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
		mockFollowFindMany.mockResolvedValue([{ userId: "u-1", horseId: "h-1" }]);
		mockSyncCircleSpaceMembership.mockResolvedValue({ ok: false });

		const summary = await reconcileSpaceMemberships();

		expect(summary.joined).toBe(0);
		expect(summary.failed).toBe(1);
		expect(summary.skipped).toBe(0);
	});

	it("counts a thrown join as failed and keeps going", async () => {
		mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
		mockFollowFindMany.mockResolvedValue([
			{ userId: "u-1", horseId: "h-1" },
			{ userId: "u-2", horseId: "h-1" },
		]);
		mockSyncCircleSpaceMembership
			.mockRejectedValueOnce(new Error("circle down"))
			.mockResolvedValueOnce({ ok: true });

		const summary = await reconcileSpaceMemberships();

		expect(summary.failed).toBe(1);
		expect(summary.joined).toBe(1);
	});

	it("no DB writes — only findMany reads are used", async () => {
		mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
		mockFollowFindMany.mockResolvedValue([{ userId: "u-1", horseId: "h-1" }]);

		await reconcileSpaceMemberships();

		expect(mockOrgFindMany).toHaveBeenCalledTimes(1);
		expect(mockFollowFindMany).toHaveBeenCalledTimes(1);
	});

	describe("S8-04 §5 kill-switch", () => {
		it("skips an org with features.horseFollows disabled entirely, logging a line, no Circle calls", async () => {
			mockOrgFindMany.mockResolvedValue([
				{ id: "org-1", metadata: JSON.stringify({ features: { horseFollows: false } }), slug: "rionna" },
			]);

			const summary = await reconcileSpaceMemberships();

			expect(mockFollowFindMany).not.toHaveBeenCalled();
			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
			expect(summary).toEqual({
				orgsProcessed: 0,
				orgsSkippedDisabled: 1,
				totalFollows: 0,
				skipped: 0,
				joined: 0,
				failed: 0,
			});
			expect(mockLoggerInfo).toHaveBeenCalledWith(
				"[Circle] Space membership reconcile: org disabled, skipping",
				expect.objectContaining({ organizationId: "org-1" }),
			);
		});

		it("processes enabled orgs normally alongside a disabled one", async () => {
			mockOrgFindMany.mockResolvedValue([
				{ id: "org-disabled", metadata: JSON.stringify({ features: { horseFollows: false } }), slug: "a" },
				{ id: "org-enabled", metadata: null, slug: "b" },
			]);
			mockFollowFindMany.mockResolvedValue([{ userId: "u-1", horseId: "h-1" }]);

			const summary = await reconcileSpaceMemberships();

			expect(mockFollowFindMany).toHaveBeenCalledTimes(1);
			expect(mockFollowFindMany).toHaveBeenCalledWith(
				expect.objectContaining({ where: { organizationId: "org-enabled" } }),
			);
			expect(summary.orgsProcessed).toBe(1);
			expect(summary.orgsSkippedDisabled).toBe(1);
		});
	});

	describe("structural skip pre-filter (bug fix: benign ok:false must not count as failed)", () => {
		it("counts a follow whose member has no circleMemberId as skipped, not failed — and never attempts the join", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([{ userId: "u-1", horseId: "h-1" }]);
			mockMemberFindMany.mockResolvedValue([{ userId: "u-1", circleMemberId: null }]);

			const summary = await reconcileSpaceMemberships();

			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
			expect(summary.skipped).toBe(1);
			expect(summary.failed).toBe(0);
			expect(summary.joined).toBe(0);
			expect(summary.totalFollows).toBe(1);
		});

		it("counts a follow whose horse has no active circleSpaceId as skipped, not failed", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([{ userId: "u-1", horseId: "h-1" }]);
			mockHorseFindMany.mockResolvedValue([{ id: "h-1", circleSpaceId: null, circleSpaceStatus: null }]);

			const summary = await reconcileSpaceMemberships();

			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
			expect(summary.skipped).toBe(1);
			expect(summary.failed).toBe(0);
		});

		it("counts a follow whose horse space is not active (e.g. archived) as skipped, not failed", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([{ userId: "u-1", horseId: "h-1" }]);
			mockHorseFindMany.mockResolvedValue([
				{ id: "h-1", circleSpaceId: "space-h-1", circleSpaceStatus: "archived" },
			]);

			const summary = await reconcileSpaceMemberships();

			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
			expect(summary.skipped).toBe(1);
			expect(summary.failed).toBe(0);
		});

		it("mixes skipped and attempted follows correctly within the same org", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([
				{ userId: "u-1", horseId: "h-1" }, // provisioned + active space -> attempted
				{ userId: "u-2", horseId: "h-1" }, // not provisioned -> skipped
			]);
			mockMemberFindMany.mockResolvedValue([PROVISIONED_MEMBER("u-1"), { userId: "u-2", circleMemberId: null }]);
			mockHorseFindMany.mockResolvedValue([ACTIVE_HORSE("h-1")]);

			const summary = await reconcileSpaceMemberships();

			expect(mockSyncCircleSpaceMembership).toHaveBeenCalledTimes(1);
			expect(mockSyncCircleSpaceMembership).toHaveBeenCalledWith({
				organizationId: "org-1",
				userId: "u-1",
				horseId: "h-1",
				action: "join",
			});
			expect(summary.skipped).toBe(1);
			expect(summary.joined).toBe(1);
			expect(summary.totalFollows).toBe(2);
		});

		it("does not call syncCircleSpaceMembership at all when every follow in the org is skipped", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([{ userId: "u-1", horseId: "h-1" }]);
			mockMemberFindMany.mockResolvedValue([{ userId: "u-1", circleMemberId: null }]);

			await reconcileSpaceMemberships();

			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
		});
	});
});
