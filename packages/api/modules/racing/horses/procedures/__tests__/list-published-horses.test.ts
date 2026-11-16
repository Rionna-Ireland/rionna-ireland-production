import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetPublishedHorses, mockGetFollowedHorseIds } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetPublishedHorses: vi.fn(),
	mockGetFollowedHorseIds: vi.fn(),
}));

const mockPaidMember = vi.hoisted(() => vi.fn(async (): Promise<{ id: string } | null> => ({ id: "m-1" })));
vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	// memberProcedure gate (W-04): the caller is a paying member.
	db: { member: { findFirst: mockPaidMember } },
	getPublishedHorses: mockGetPublishedHorses,
}));

vi.mock("../../lib/horse-follows", () => ({
	getFollowedHorseIds: mockGetFollowedHorseIds,
}));

import { listPublishedHorses } from "../list-published-horses";

const MEMBER = { id: "user-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: MEMBER, session: SESSION });
});

describe("listPublishedHorses (S9-05 invite-only gating)", () => {
	it("refuses a cancelled member with membership_inactive (W-04)", async () => {
		mockPaidMember.mockResolvedValueOnce(null);
		await expect(call(listPublishedHorses, { organizationId: "org-1" }, ctx)).rejects.toMatchObject({
			code: "FORBIDDEN",
			data: { reason: "membership_inactive" },
		});
		expect(mockGetPublishedHorses).not.toHaveBeenCalled();
	});

	it("includes an open horse regardless of follow state", async () => {
		mockGetPublishedHorses.mockResolvedValue([{ id: "h-1", name: "Open Horse", inviteOnly: false }]);
		mockGetFollowedHorseIds.mockResolvedValue(new Set());

		const res = await call(listPublishedHorses, { organizationId: "org-1" }, ctx);

		expect(res.map((h) => h.id)).toEqual(["h-1"]);
	});

	it("includes an invite-only horse the caller follows", async () => {
		mockGetPublishedHorses.mockResolvedValue([
			{ id: "h-1", name: "Invite Horse", inviteOnly: true },
		]);
		mockGetFollowedHorseIds.mockResolvedValue(new Set(["h-1"]));

		const res = await call(listPublishedHorses, { organizationId: "org-1" }, ctx);

		expect(res.map((h) => h.id)).toEqual(["h-1"]);
		expect(res[0]).toMatchObject({ isFollowing: true });
	});

	it("drops an invite-only horse the caller does not follow", async () => {
		mockGetPublishedHorses.mockResolvedValue([
			{ id: "h-1", name: "Open Horse", inviteOnly: false },
			{ id: "h-2", name: "Invite Horse", inviteOnly: true },
		]);
		mockGetFollowedHorseIds.mockResolvedValue(new Set());

		const res = await call(listPublishedHorses, { organizationId: "org-1" }, ctx);

		expect(res.map((h) => h.id)).toEqual(["h-1"]);
	});

	it("does not issue an extra query — filters using the already-fetched followed set", async () => {
		mockGetPublishedHorses.mockResolvedValue([
			{ id: "h-1", name: "Invite Horse", inviteOnly: true },
		]);
		mockGetFollowedHorseIds.mockResolvedValue(new Set(["h-1"]));

		await call(listPublishedHorses, { organizationId: "org-1" }, ctx);

		expect(mockGetFollowedHorseIds).toHaveBeenCalledTimes(1);
	});
});
