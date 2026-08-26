import { describe, it, expect, vi, beforeEach } from "vitest";

const {
	mockUpsert,
	mockDeleteMany,
	mockMemberFindMany,
	mockCreateMany,
	mockFindMany,
	mockOrgFindUnique,
	mockHorseFindUnique,
	mockSyncCircleSpaceMembership,
	mockLoggerInfo,
} = vi.hoisted(() => ({
	mockUpsert: vi.fn(),
	mockDeleteMany: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockCreateMany: vi.fn(),
	mockFindMany: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockHorseFindUnique: vi.fn(),
	mockSyncCircleSpaceMembership: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));
vi.mock("@repo/database", () => ({
	db: {
		horseFollow: {
			upsert: mockUpsert,
			deleteMany: mockDeleteMany,
			createMany: mockCreateMany,
			findMany: mockFindMany,
		},
		member: { findMany: mockMemberFindMany },
		organization: { findUnique: mockOrgFindUnique },
		horse: { findUnique: mockHorseFindUnique },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));
vi.mock("@repo/payments/lib/circle-space-membership", () => ({
	syncCircleSpaceMembership: mockSyncCircleSpaceMembership,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
	followHorse,
	unfollowHorse,
	followAllMembers,
	getFollowedHorseIds,
	listFollowedHorses,
	listHorseFollowers,
} from "../horse-follows";

beforeEach(() => {
	vi.clearAllMocks();
	mockOrgFindUnique.mockResolvedValue({ metadata: null });
	mockHorseFindUnique.mockResolvedValue({ inviteOnly: false });
	mockSyncCircleSpaceMembership.mockResolvedValue({ ok: true });
});

describe("followHorse", () => {
	it("upserts idempotently keyed on userId+horseId", async () => {
		mockUpsert.mockResolvedValue({ id: "hf-1" });
		await followHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" });
		expect(mockUpsert).toHaveBeenCalledWith({
			where: { userId_horseId: { userId: "u-1", horseId: "h-1" } },
			create: { organizationId: "org-1", userId: "u-1", horseId: "h-1" },
			update: {},
		});
	});

	it("syncs a Circle space join after the DB write", async () => {
		mockUpsert.mockResolvedValue({ id: "hf-1" });
		await followHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" });
		expect(mockSyncCircleSpaceMembership).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "u-1",
			horseId: "h-1",
			action: "join",
		});
	});

	it("does not throw when the Circle sync fails", async () => {
		mockUpsert.mockResolvedValue({ id: "hf-1" });
		mockSyncCircleSpaceMembership.mockRejectedValue(new Error("circle down"));
		await expect(
			followHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" }),
		).resolves.toEqual({ ok: true });
		expect(mockUpsert).toHaveBeenCalled();
	});
});

describe("unfollowHorse", () => {
	it("deleteMany (idempotent no-throw when absent)", async () => {
		mockDeleteMany.mockResolvedValue({ count: 0 });
		await unfollowHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" });
		expect(mockDeleteMany).toHaveBeenCalledWith({
			where: { userId: "u-1", horseId: "h-1", organizationId: "org-1" },
		});
	});

	it("syncs a Circle space leave after the DB write", async () => {
		mockDeleteMany.mockResolvedValue({ count: 1 });
		await unfollowHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" });
		expect(mockSyncCircleSpaceMembership).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "u-1",
			horseId: "h-1",
			action: "leave",
		});
	});

	it("does not throw when the Circle sync fails", async () => {
		mockDeleteMany.mockResolvedValue({ count: 1 });
		mockSyncCircleSpaceMembership.mockRejectedValue(new Error("circle down"));
		await expect(
			unfollowHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" }),
		).resolves.toEqual({ ok: true });
		expect(mockDeleteMany).toHaveBeenCalled();
	});
});

describe("S8-04 §5 kill-switch", () => {
	beforeEach(() => {
		mockOrgFindUnique.mockResolvedValue({
			metadata: JSON.stringify({ features: { horseFollows: false } }),
		});
	});

	it("followHorse is a no-op (ok:false, disabled:true) — no DB write, no Circle join", async () => {
		const res = await followHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" });
		expect(res).toEqual({ ok: false, disabled: true });
		expect(mockUpsert).not.toHaveBeenCalled();
		expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
	});

	it("unfollowHorse is a no-op (ok:false, disabled:true) — no DB write, no Circle leave", async () => {
		const res = await unfollowHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" });
		expect(res).toEqual({ ok: false, disabled: true });
		expect(mockDeleteMany).not.toHaveBeenCalled();
		expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
	});

	it("followAllMembers is a no-op ({added:0, disabled:true}) — no DB write, no Circle joins", async () => {
		const res = await followAllMembers({ organizationId: "org-1", horseId: "h-1" });
		expect(res).toEqual({ added: 0, disabled: true });
		expect(mockMemberFindMany).not.toHaveBeenCalled();
		expect(mockCreateMany).not.toHaveBeenCalled();
		expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
	});

	it("re-enabling (features.horseFollows: true) restores normal followHorse behaviour", async () => {
		mockOrgFindUnique.mockResolvedValue({
			metadata: JSON.stringify({ features: { horseFollows: true } }),
		});
		mockUpsert.mockResolvedValue({ id: "hf-1" });

		const res = await followHorse({ organizationId: "org-1", userId: "u-1", horseId: "h-1" });

		expect(res).toEqual({ ok: true });
		expect(mockUpsert).toHaveBeenCalled();
		expect(mockSyncCircleSpaceMembership).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "u-1",
			horseId: "h-1",
			action: "join",
		});
	});
});

describe("followAllMembers", () => {
	it("creates a follow for every member, skipping duplicates", async () => {
		mockMemberFindMany.mockResolvedValue([{ userId: "u-1" }, { userId: "u-2" }]);
		mockCreateMany.mockResolvedValue({ count: 2 });
		const res = await followAllMembers({ organizationId: "org-1", horseId: "h-1" });
		expect(mockCreateMany).toHaveBeenCalledWith({
			data: [
				{ organizationId: "org-1", userId: "u-1", horseId: "h-1" },
				{ organizationId: "org-1", userId: "u-2", horseId: "h-1" },
			],
			skipDuplicates: true,
		});
		expect(res).toEqual({ added: 2 });
	});

	it("best-effort joins each member's Circle space and logs a summary", async () => {
		mockMemberFindMany.mockResolvedValue([{ userId: "u-1" }, { userId: "u-2" }]);
		mockCreateMany.mockResolvedValue({ count: 2 });
		mockSyncCircleSpaceMembership
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: false });

		await followAllMembers({ organizationId: "org-1", horseId: "h-1" });

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
		expect(mockLoggerInfo).toHaveBeenCalledWith(
			expect.stringContaining("space join"),
			expect.objectContaining({ joined: 1, failed: 1 }),
		);
	});

	it("never throws even if the Circle sync rejects", async () => {
		mockMemberFindMany.mockResolvedValue([{ userId: "u-1" }]);
		mockCreateMany.mockResolvedValue({ count: 1 });
		mockSyncCircleSpaceMembership.mockRejectedValue(new Error("circle down"));

		await expect(
			followAllMembers({ organizationId: "org-1", horseId: "h-1" }),
		).resolves.toEqual({ added: 1 });
	});
});

describe("followAllMembers invite-only gating (S9-05)", () => {
	it("skips an invite-only horse target: {added:0, skippedInviteOnly:1}, no writes", async () => {
		mockHorseFindUnique.mockResolvedValue({ inviteOnly: true });

		const res = await followAllMembers({ organizationId: "org-1", horseId: "h-1" });

		expect(res).toEqual({ added: 0, skippedInviteOnly: 1 });
		expect(mockMemberFindMany).not.toHaveBeenCalled();
		expect(mockCreateMany).not.toHaveBeenCalled();
		expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
	});

	it("proceeds normally when the horse is not invite-only", async () => {
		mockHorseFindUnique.mockResolvedValue({ inviteOnly: false });
		mockMemberFindMany.mockResolvedValue([{ userId: "u-1" }]);
		mockCreateMany.mockResolvedValue({ count: 1 });

		const res = await followAllMembers({ organizationId: "org-1", horseId: "h-1" });

		expect(res).toEqual({ added: 1 });
		expect(mockCreateMany).toHaveBeenCalled();
	});
});

describe("getFollowedHorseIds", () => {
	it("returns a Set of horseIds", async () => {
		mockFindMany.mockResolvedValue([{ horseId: "h-1" }, { horseId: "h-2" }]);
		const ids = await getFollowedHorseIds({ organizationId: "org-1", userId: "u-1" });
		expect(ids.has("h-1")).toBe(true);
		expect(ids.has("h-2")).toBe(true);
		expect(ids.size).toBe(2);
	});
});

describe("listHorseFollowers", () => {
	it("maps follower rows to member summaries", async () => {
		mockFindMany.mockResolvedValue([
			{
				userId: "u-1",
				createdAt: new Date("2026-01-01"),
				user: { name: "Alice", email: "a@x.com" },
			},
		]);
		const rows = await listHorseFollowers({ organizationId: "org-1", horseId: "h-1" });
		expect(rows[0]).toMatchObject({ userId: "u-1", name: "Alice", email: "a@x.com" });
	});
});

describe("listFollowedHorses", () => {
	it("returns the user's follow rows with horse+trainer included, newest-first", async () => {
		mockFindMany.mockResolvedValue([{ id: "hf-1", horse: { id: "h-1", name: "A" } }]);
		const rows = await listFollowedHorses({ organizationId: "org-1", userId: "u-1" });
		expect(mockFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { organizationId: "org-1", userId: "u-1" },
				orderBy: { createdAt: "desc" },
			}),
		);
		expect(rows).toHaveLength(1);
	});
});

describe("followAllMembers concurrency (Kimi H1)", () => {
	it("runs Circle joins with bounded parallelism, not serially", async () => {
		const members = Array.from({ length: 6 }, (_, i) => ({ userId: `u-${i}` }));
		mockMemberFindMany.mockResolvedValue(members);
		mockCreateMany.mockResolvedValue({ count: members.length });

		let inFlight = 0;
		let maxInFlight = 0;
		mockSyncCircleSpaceMembership.mockImplementation(async () => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight--;
			return { ok: true };
		});

		await followAllMembers({ organizationId: "org-1", horseId: "h-1" });

		expect(mockSyncCircleSpaceMembership).toHaveBeenCalledTimes(members.length);
		expect(maxInFlight).toBeGreaterThan(1);
	});

	it("still logs the joined/failed summary with bounded execution", async () => {
		mockMemberFindMany.mockResolvedValue([
			{ userId: "u-1" },
			{ userId: "u-2" },
			{ userId: "u-3" },
		]);
		mockCreateMany.mockResolvedValue({ count: 3 });
		mockSyncCircleSpaceMembership
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: false })
			.mockRejectedValueOnce(new Error("circle down"));

		await followAllMembers({ organizationId: "org-1", horseId: "h-1" });

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			"[Circle] followAllMembers space join summary",
			expect.objectContaining({ joined: 1, failed: 2 }),
		);
	});
});
