import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetFollowedHorseIds, mockHorseFollowsEnabled } = vi.hoisted(() => ({
	mockGetFollowedHorseIds: vi.fn(),
	mockHorseFollowsEnabled: vi.fn(),
}));

vi.mock("../horse-follows", () => ({
	getFollowedHorseIds: mockGetFollowedHorseIds,
	horseFollowsEnabled: mockHorseFollowsEnabled,
}));

import { canAccessHorse, getAccessibleHorseWhere } from "../horse-access";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("canAccessHorse", () => {
	it("an open (non-invite-only) horse is always accessible", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
		const accessible = await canAccessHorse({
			organizationId: "org-1",
			userId: "u-1",
			horse: { id: "h-1", inviteOnly: false },
		});
		expect(accessible).toBe(true);
	});

	it("a followed invite-only horse is accessible", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set(["h-1"]));
		const accessible = await canAccessHorse({
			organizationId: "org-1",
			userId: "u-1",
			horse: { id: "h-1", inviteOnly: true },
		});
		expect(accessible).toBe(true);
	});

	it("an unfollowed invite-only horse is not accessible", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
		const accessible = await canAccessHorse({
			organizationId: "org-1",
			userId: "u-1",
			horse: { id: "h-1", inviteOnly: true },
		});
		expect(accessible).toBe(false);
	});

	it("followed status is scoped per-org/user via getFollowedHorseIds", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set(["h-2"]));
		await canAccessHorse({
			organizationId: "org-1",
			userId: "u-1",
			horse: { id: "h-2", inviteOnly: true },
		});
		expect(mockGetFollowedHorseIds).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "u-1",
		});
	});
});

describe("canAccessHorse — kill-switch independence (S9-05 binding semantic)", () => {
	it("never consults horseFollowsEnabled — access gating is independent of the follow feature kill-switch", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
		const accessible = await canAccessHorse({
			organizationId: "org-1",
			userId: "u-1",
			horse: { id: "h-1", inviteOnly: true },
		});
		expect(accessible).toBe(false);
		expect(mockHorseFollowsEnabled).not.toHaveBeenCalled();
	});

	it("gating stays enforced even when features.horseFollows would be false", async () => {
		// horseFollowsEnabled is mocked to resolve false, but canAccessHorse must
		// not be affected by it either way — it never calls it.
		mockHorseFollowsEnabled.mockResolvedValue(false);
		mockGetFollowedHorseIds.mockResolvedValue(new Set(["h-1"]));
		const accessible = await canAccessHorse({
			organizationId: "org-1",
			userId: "u-1",
			horse: { id: "h-1", inviteOnly: true },
		});
		expect(accessible).toBe(true);
		expect(mockHorseFollowsEnabled).not.toHaveBeenCalled();
	});
});

describe("getAccessibleHorseWhere", () => {
	it("builds an OR where clause from the followed set", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set(["h-1", "h-2"]));
		const where = await getAccessibleHorseWhere({ organizationId: "org-1", userId: "u-1" });
		expect(where.OR[0]).toEqual({ inviteOnly: false });
		expect(where.OR[1].id.in.sort()).toEqual(["h-1", "h-2"]);
	});

	it("returns an empty in-list when the user follows nothing", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
		const where = await getAccessibleHorseWhere({ organizationId: "org-1", userId: "u-1" });
		expect(where).toEqual({ OR: [{ inviteOnly: false }, { id: { in: [] } }] });
	});

	it("never consults horseFollowsEnabled", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
		await getAccessibleHorseWhere({ organizationId: "org-1", userId: "u-1" });
		expect(mockHorseFollowsEnabled).not.toHaveBeenCalled();
	});
});
