import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockOrgFindMany,
	mockFollowFindMany,
	mockMemberFindMany,
	mockHorseFindMany,
	mockHorseUpdate,
	mockSyncCircleSpaceMembership,
	mockCreateCircleService,
	mockSetSpaceVisibility,
	mockLoggerInfo,
	mockLoggerWarn,
} = vi.hoisted(() => ({
	mockOrgFindMany: vi.fn(),
	mockFollowFindMany: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockHorseFindMany: vi.fn(),
	mockHorseUpdate: vi.fn(),
	mockSyncCircleSpaceMembership: vi.fn(),
	mockCreateCircleService: vi.fn(),
	mockSetSpaceVisibility: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findMany: mockOrgFindMany },
		horseFollow: { findMany: mockFollowFindMany },
		member: { findMany: mockMemberFindMany },
		horse: { findMany: mockHorseFindMany, update: mockHorseUpdate },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));

vi.mock("@repo/payments/lib/circle-space-membership", () => ({
	syncCircleSpaceMembership: mockSyncCircleSpaceMembership,
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: mockCreateCircleService,
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
	// the pre-existing tests' assumption that follows are attempted. These
	// fixture horses carry no inviteOnly/circleSpaceVisibility, so the S9-05
	// visibility re-assert below finds nothing to fix by default.
	mockMemberFindMany.mockResolvedValue([PROVISIONED_MEMBER("u-1"), PROVISIONED_MEMBER("u-2")]);
	mockHorseFindMany.mockResolvedValue([ACTIVE_HORSE("h-1")]);
	mockCreateCircleService.mockReturnValue({ setSpaceVisibility: mockSetSpaceVisibility });
	mockSetSpaceVisibility.mockResolvedValue({ ok: true, data: { circleSpaceId: "space-x", isPrivate: true } });
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
			visibilityFixed: 0,
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
				visibilityFixed: 0,
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

	describe("S9-05: Circle space visibility re-assert", () => {
		it("fixes a horse whose mirror says public but inviteOnly is true: setSpaceVisibility(isPrivate:true) + mirror + count", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([]);
			mockHorseFindMany.mockResolvedValue([
				{ id: "h-1", circleSpaceId: "space-h-1", inviteOnly: true, circleSpaceVisibility: "public" },
			]);
			mockSetSpaceVisibility.mockResolvedValue({
				ok: true,
				data: { circleSpaceId: "space-h-1", isPrivate: true },
			});

			const summary = await reconcileSpaceMemberships();

			expect(mockCreateCircleService).toHaveBeenCalledWith("rionna");
			expect(mockSetSpaceVisibility).toHaveBeenCalledWith({ spaceId: "space-h-1", isPrivate: true });
			expect(mockHorseUpdate).toHaveBeenCalledWith({
				where: { id: "h-1" },
				data: { circleSpaceVisibility: "private" },
			});
			expect(summary.visibilityFixed).toBe(1);
		});

		it("fixes a horse whose mirror says private but inviteOnly is false: setSpaceVisibility(isPrivate:false) + mirror + count", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([]);
			mockHorseFindMany.mockResolvedValue([
				{ id: "h-1", circleSpaceId: "space-h-1", inviteOnly: false, circleSpaceVisibility: "private" },
			]);
			mockSetSpaceVisibility.mockResolvedValue({
				ok: true,
				data: { circleSpaceId: "space-h-1", isPrivate: false },
			});

			const summary = await reconcileSpaceMemberships();

			expect(mockSetSpaceVisibility).toHaveBeenCalledWith({ spaceId: "space-h-1", isPrivate: false });
			expect(mockHorseUpdate).toHaveBeenCalledWith({
				where: { id: "h-1" },
				data: { circleSpaceVisibility: "public" },
			});
			expect(summary.visibilityFixed).toBe(1);
		});

		it("treats any non-'private' mirror value (e.g. legacy 'member_public') as public when diffing", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([]);
			mockHorseFindMany.mockResolvedValue([
				{ id: "h-1", circleSpaceId: "space-h-1", inviteOnly: false, circleSpaceVisibility: "member_public" },
			]);

			const summary = await reconcileSpaceMemberships();

			// inviteOnly:false + mirror already non-"private" (treated as public) -> no mismatch
			expect(mockSetSpaceVisibility).not.toHaveBeenCalled();
			expect(summary.visibilityFixed).toBe(0);
		});

		it("does not touch a horse whose mirror already agrees with inviteOnly", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([]);
			mockHorseFindMany.mockResolvedValue([
				{ id: "h-1", circleSpaceId: "space-h-1", inviteOnly: true, circleSpaceVisibility: "private" },
				{ id: "h-2", circleSpaceId: "space-h-2", inviteOnly: false, circleSpaceVisibility: "public" },
			]);

			const summary = await reconcileSpaceMemberships();

			expect(mockSetSpaceVisibility).not.toHaveBeenCalled();
			expect(mockHorseUpdate).not.toHaveBeenCalled();
			expect(summary.visibilityFixed).toBe(0);
		});

		it("on Circle failure: does not write the mirror, does not count as fixed, and warns", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([]);
			mockHorseFindMany.mockResolvedValue([
				{ id: "h-1", circleSpaceId: "space-h-1", inviteOnly: true, circleSpaceVisibility: "public" },
			]);
			mockSetSpaceVisibility.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });

			const summary = await reconcileSpaceMemberships();

			expect(mockHorseUpdate).not.toHaveBeenCalled();
			expect(summary.visibilityFixed).toBe(0);
			expect(mockLoggerWarn).toHaveBeenCalledWith(
				expect.stringContaining("[Circle]"),
				expect.objectContaining({ horseId: "h-1" }),
			);
		});

		it("fixes multiple horses in one org and sums visibilityFixed", async () => {
			mockOrgFindMany.mockResolvedValue([{ id: "org-1", metadata: null, slug: "rionna" }]);
			mockFollowFindMany.mockResolvedValue([]);
			mockHorseFindMany.mockResolvedValue([
				{ id: "h-1", circleSpaceId: "space-h-1", inviteOnly: true, circleSpaceVisibility: "public" },
				{ id: "h-2", circleSpaceId: "space-h-2", inviteOnly: false, circleSpaceVisibility: "private" },
			]);

			const summary = await reconcileSpaceMemberships();

			expect(mockSetSpaceVisibility).toHaveBeenCalledTimes(2);
			expect(summary.visibilityFixed).toBe(2);
		});

		it("skips the join pass for a disabled org but still runs S9-05 visibility healing (kill-switch disables the follow feature, never the privacy)", async () => {
			mockOrgFindMany.mockResolvedValue([
				{ id: "org-1", metadata: JSON.stringify({ features: { horseFollows: false } }), slug: "rionna" },
			]);
			mockHorseFindMany.mockResolvedValue([
				{ id: "h-1", circleSpaceId: "space-h-1", inviteOnly: true, circleSpaceVisibility: "public" },
			]);

			const summary = await reconcileSpaceMemberships();

			// The join re-assert pass is still skipped entirely for a disabled org.
			expect(mockFollowFindMany).not.toHaveBeenCalled();
			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
			expect(summary.orgsProcessed).toBe(0);
			expect(summary.orgsSkippedDisabled).toBe(1);

			// But the S9-05 privacy re-assert is not gated on the kill-switch — it
			// still runs and heals the mismatch.
			expect(mockHorseFindMany).toHaveBeenCalled();
			expect(mockCreateCircleService).toHaveBeenCalledWith("rionna");
			expect(mockSetSpaceVisibility).toHaveBeenCalledWith({ spaceId: "space-h-1", isPrivate: true });
			expect(mockHorseUpdate).toHaveBeenCalledWith({
				where: { id: "h-1" },
				data: { circleSpaceVisibility: "private" },
			});
			expect(summary.visibilityFixed).toBe(1);
		});
	});
});
