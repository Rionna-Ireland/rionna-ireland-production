import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockOrgFindMany, mockFollowFindMany, mockSyncCircleSpaceMembership, mockLoggerInfo, mockLoggerWarn } =
	vi.hoisted(() => ({
		mockOrgFindMany: vi.fn(),
		mockFollowFindMany: vi.fn(),
		mockSyncCircleSpaceMembership: vi.fn(),
		mockLoggerInfo: vi.fn(),
		mockLoggerWarn: vi.fn(),
	}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findMany: mockOrgFindMany },
		horseFollow: { findMany: mockFollowFindMany },
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

beforeEach(() => {
	vi.clearAllMocks();
	mockSyncCircleSpaceMembership.mockResolvedValue({ ok: true });
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
});
