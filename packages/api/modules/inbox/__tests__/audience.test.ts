import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMemberFindMany, mockResolveFollowers } = vi.hoisted(() => ({
	mockMemberFindMany: vi.fn(),
	mockResolveFollowers: vi.fn(),
}));

vi.mock("@repo/database", () => ({ db: { member: { findMany: mockMemberFindMany } } }));
vi.mock("../../push/horse-follower-filter", () => ({ resolveHorseFollowerUserIds: mockResolveFollowers }));

import { resolveInboxUserIds } from "../audience";

beforeEach(() => {
	vi.clearAllMocks();
	mockMemberFindMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }]);
});

describe("resolveInboxUserIds", () => {
	it("returns every org member for org audiences", async () => {
		expect(await resolveInboxUserIds("org1", { kind: "org" })).toEqual(["u1", "u2", "u3"]);
		expect(mockMemberFindMany).toHaveBeenCalledWith({ where: { organizationId: "org1" }, select: { userId: true } });
	});

	it("excludes the actor", async () => {
		expect(await resolveInboxUserIds("org1", { kind: "org" }, "u2")).toEqual(["u1", "u3"]);
	});

	it("intersects with horse followers", async () => {
		mockResolveFollowers.mockResolvedValue(new Set(["u1", "u3", "not-a-member"]));
		expect(await resolveInboxUserIds("org1", { kind: "horseFollowers", horseId: "h1" })).toEqual(["u1", "u3"]);
	});

	it("keeps everyone when the follower filter does not apply", async () => {
		mockResolveFollowers.mockResolvedValue(null);
		expect(await resolveInboxUserIds("org1", { kind: "horseFollowers", horseId: "h1" })).toEqual(["u1", "u2", "u3"]);
	});

	it("returns a single user without querying members", async () => {
		expect(await resolveInboxUserIds("org1", { kind: "user", userId: "u9" })).toEqual(["u9"]);
		expect(await resolveInboxUserIds("org1", { kind: "user", userId: "u9" }, "u9")).toEqual([]);
		expect(mockMemberFindMany).not.toHaveBeenCalled();
	});
});
