import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMemberFindMany, mockTrainerFindMany, mockAttrFindMany } = vi.hoisted(() => ({
	mockMemberFindMany: vi.fn(),
	mockTrainerFindMany: vi.fn(),
	mockAttrFindMany: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		member: { findMany: mockMemberFindMany },
		trainer: { findMany: mockTrainerFindMany },
		postAttribution: { findMany: mockAttrFindMany },
	},
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { enrichPosts, loadAuthorRoles, trainerAvatarUrl } from "../lib/author-identity";

beforeEach(() => {
	vi.clearAllMocks();
	mockMemberFindMany.mockResolvedValue([]);
	mockTrainerFindMany.mockResolvedValue([]);
	mockAttrFindMany.mockResolvedValue([]);
});

describe("loadAuthorRoles", () => {
	it("maps trainer over staff, staff for owner/admin, none for members, in batched queries", async () => {
		mockMemberFindMany.mockResolvedValue([
			{ circleMemberId: "c1", userId: "u1", role: "member" },
			{ circleMemberId: "c2", userId: "u2", role: "admin" },
			{ circleMemberId: "c3", userId: "u3", role: "owner" },
			{ circleMemberId: "c4", userId: "u4", role: "member" },
		]);
		mockTrainerFindMany.mockResolvedValue([{ userId: "u1" }, { userId: "u3" }]);
		const roles = await loadAuthorRoles("org1", ["c1", "c2", "c3", "c4", "c1", null]);
		expect(Object.fromEntries(roles)).toEqual({ c1: "trainer", c2: "staff", c3: "trainer" });
		expect(mockMemberFindMany).toHaveBeenCalledTimes(1);
		expect(mockTrainerFindMany).toHaveBeenCalledTimes(1);
	});

	it("treats Member.role=member + User.role=admin/platformAdmin as staff; trainer still wins", async () => {
		mockMemberFindMany.mockResolvedValue([
			{ circleMemberId: "c1", userId: "u1", role: "member", user: { role: "admin" } },
			{ circleMemberId: "c2", userId: "u2", role: "member", user: { role: "platformAdmin" } },
			{ circleMemberId: "c3", userId: "u3", role: "member", user: { role: "admin" } },
			{ circleMemberId: "c4", userId: "u4", role: "member", user: { role: null } },
		]);
		mockTrainerFindMany.mockResolvedValue([{ userId: "u3" }]);
		const roles = await loadAuthorRoles("org1", ["c1", "c2", "c3", "c4"]);
		expect(Object.fromEntries(roles)).toEqual({ c1: "staff", c2: "staff", c3: "trainer" });
	});

	it("skips the DB entirely with no ids and fails open on errors", async () => {
		expect((await loadAuthorRoles("org1", [null])).size).toBe(0);
		expect(mockMemberFindMany).not.toHaveBeenCalled();
		mockMemberFindMany.mockRejectedValue(new Error("boom"));
		expect((await loadAuthorRoles("org1", ["c1"])).size).toBe(0);
	});
});

describe("trainerAvatarUrl", () => {
	it("prefers meta.avatarUrl, then the linked user's image", () => {
		expect(trainerAvatarUrl({ meta: { avatarUrl: "a" }, user: { image: "b" } })).toBe("a");
		expect(trainerAvatarUrl({ meta: null, user: { image: "b" } })).toBe("b");
		expect(trainerAvatarUrl({ meta: {}, user: null })).toBeNull();
	});
});

describe("enrichPosts", () => {
	interface TestPost {
		id: string;
		kind: string;
		spaceId: string | null;
		authorName: string | null;
		authorAvatarUrl: string | null;
		authorCircleMemberId: string | null;
		isAnnouncement?: boolean;
		authorRole?: "trainer" | "staff" | null;
	}
	const post = (over: Partial<TestPost>): TestPost => ({
		id: "p1",
		kind: "post",
		spaceId: "s1",
		authorName: "Real Admin",
		authorAvatarUrl: null,
		authorCircleMemberId: "c2",
		...over,
	});

	it("flags announcements by communitySpaceId and sets staff role", async () => {
		mockMemberFindMany.mockResolvedValue([{ circleMemberId: "c2", userId: "u2", role: "admin" }]);
		const [a, b] = await enrichPosts("org1", [post({}), post({ id: "p2", spaceId: "s9" })], {
			announcementSpaceId: 1,
		});
		expect(a).toMatchObject({ isAnnouncement: false, authorRole: "staff" });
		const [c] = await enrichPosts("org1", [post({ spaceId: "7" })], { announcementSpaceId: 7 });
		expect(c?.isAnnouncement).toBe(true);
		expect(b?.isAnnouncement).toBe(false);
	});

	it("swaps author to the trainer for attributed posts", async () => {
		mockAttrFindMany.mockResolvedValue([
			{
				circlePostId: "p1",
				trainer: { name: "Ger Byrne", meta: { avatarUrl: "https://x/g.png" }, user: null },
			},
		]);
		const [a, b] = await enrichPosts("org1", [post({}), post({ id: "p2" })], {});
		expect(a).toMatchObject({
			authorName: "Ger Byrne",
			authorAvatarUrl: "https://x/g.png",
			authorRole: "trainer",
		});
		expect(b).toMatchObject({ authorName: "Real Admin", authorRole: null });
		expect(mockAttrFindMany).toHaveBeenCalledTimes(1);
	});

	it("leaves poll and story rows untouched", async () => {
		const poll = { id: "x", kind: "poll", spaceId: null, authorName: null };
		const [out] = await enrichPosts("org1", [poll], {});
		expect(out).toBe(poll);
	});
});
