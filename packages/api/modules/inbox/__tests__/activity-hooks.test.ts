import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPostFindUnique, mockMemberFindUnique, mockHorseFindFirst, mockRecordActivity, mockRecordInbox, mockSendPush, mockLoggerError } =
	vi.hoisted(() => ({
		mockPostFindUnique: vi.fn(),
		mockMemberFindUnique: vi.fn(),
		mockHorseFindFirst: vi.fn(),
		mockRecordActivity: vi.fn(),
		mockRecordInbox: vi.fn(),
		mockSendPush: vi.fn(),
		mockLoggerError: vi.fn(),
	}));

vi.mock("@repo/database", () => ({
	db: {
		communityPost: { findUnique: mockPostFindUnique },
		member: { findUnique: mockMemberFindUnique },
		horse: { findFirst: mockHorseFindFirst },
	},
}));
vi.mock("../activity", () => ({ recordActivity: mockRecordActivity, COMMENT_PUSH_THROTTLE_MS: 900000 }));
vi.mock("../record", () => ({ recordInbox: mockRecordInbox }));
vi.mock("../../push/service", () => ({ sendPush: mockSendPush }));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: mockLoggerError } }));

import { onCommunityPostRemoved, onMemberPostCreated, onPostCommented, onPostLiked } from "../activity-hooks";

const actor = { userId: "sarah", name: "Sarah" };
const PUSHED_AT = new Date("2026-09-15T12:00:00Z");

beforeEach(() => {
	vi.clearAllMocks();
	mockPostFindUnique.mockResolvedValue({ memberId: "m-author", circleSpaceId: "s1", excerpt: "My post", deletedAt: null });
	mockMemberFindUnique.mockResolvedValue({ userId: "author" });
	mockRecordActivity.mockResolvedValue({ unseenCount: 3, shouldPush: false, pushedAt: null });
	mockRecordInbox.mockResolvedValue(new Map());
	mockSendPush.mockResolvedValue({ attempted: 1, sent: 1, failed: 0 });
});

describe("onPostLiked", () => {
	it("records a grouped like for the post author", async () => {
		await onPostLiked({ organizationId: "org1", circlePostId: "p1", actor });
		expect(mockPostFindUnique).toHaveBeenCalledWith({
			where: { circlePostId: "p1" },
			select: { memberId: true, circleSpaceId: true, excerpt: true, deletedAt: true },
		});
		expect(mockRecordActivity).toHaveBeenCalledWith({
			organizationId: "org1",
			recipientUserId: "author",
			actor,
			item: { kind: "post_like", groupKey: "likes:p1", title: "", body: "My post", data: { screen: "post", spaceId: "s1", postId: "p1" }, refId: "p1" },
		});
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it("ignores club posts and deleted posts", async () => {
		mockPostFindUnique.mockResolvedValueOnce(null);
		await onPostLiked({ organizationId: "org1", circlePostId: "p1", actor });
		mockPostFindUnique.mockResolvedValueOnce({ memberId: "m", circleSpaceId: "s1", excerpt: "x", deletedAt: new Date() });
		await onPostLiked({ organizationId: "org1", circlePostId: "p1", actor });
		expect(mockRecordActivity).not.toHaveBeenCalled();
	});
});

describe("onPostCommented", () => {
	it("records a grouped comment and pushes when the window is claimed", async () => {
		mockRecordActivity.mockResolvedValue({ unseenCount: 4, shouldPush: true, pushedAt: PUSHED_AT });
		await onPostCommented({ organizationId: "org1", circlePostId: "p1", commentBody: "Great run!", actor });
		expect(mockRecordActivity).toHaveBeenCalledWith(expect.objectContaining({
			recipientUserId: "author",
			item: expect.objectContaining({ kind: "post_comment", groupKey: "comments:p1", body: "Great run!" }),
			throttlePushMs: 900000,
		}));
		expect(mockSendPush).toHaveBeenCalledWith({
			organizationId: "org1",
			triggerType: "COMMUNITY_COMMENT",
			triggerRefId: `p1:${PUSHED_AT.toISOString()}`,
			targetUserId: "author",
			title: "Sarah commented on your post",
			body: "Great run!",
			data: { screen: "post", spaceId: "s1", postId: "p1" },
			badge: 4,
		});
	});

	it("does not push inside the throttle window or for self-comments", async () => {
		await onPostCommented({ organizationId: "org1", circlePostId: "p1", commentBody: "x", actor });
		mockRecordActivity.mockResolvedValueOnce(null);
		await onPostCommented({ organizationId: "org1", circlePostId: "p1", commentBody: "x", actor });
		expect(mockSendPush).not.toHaveBeenCalled();
	});
});

describe("onMemberPostCreated", () => {
	it("groups posts in a horse space for that horse's followers", async () => {
		mockHorseFindFirst.mockResolvedValue({ id: "h1", name: "Rionna's Dream", photos: [{ url: "https://x/h.jpg", caption: "" }] });
		vi.useFakeTimers().setSystemTime(new Date("2026-09-15T10:00:00Z"));
		await onMemberPostCreated({ organizationId: "org1", circleSpaceId: "s9", circlePostId: "p9", author: actor });
		vi.useRealTimers();
		expect(mockHorseFindFirst).toHaveBeenCalledWith({ where: { organizationId: "org1", circleSpaceId: "s9" }, select: { id: true, name: true, photos: true } });
		expect(mockRecordInbox).toHaveBeenCalledWith({
			organizationId: "org1",
			audience: { kind: "horseFollowers", horseId: "h1" },
			excludeUserId: "sarah",
			regroup: true,
			item: {
				kind: "horse_posts",
				groupKey: "horsePosts:h1:2026-09-15",
				title: "New posts in Rionna's Dream",
				body: "",
				data: { screen: "spaceFeed", spaceId: "s9" },
				refId: "h1",
				imageUrl: "https://x/h.jpg",
				actorUserId: "sarah",
				actorName: "Sarah",
			},
		});
	});

	it("does nothing for general spaces", async () => {
		mockHorseFindFirst.mockResolvedValue(null);
		await onMemberPostCreated({ organizationId: "org1", circleSpaceId: "s1", circlePostId: "p1", author: actor });
		expect(mockRecordInbox).not.toHaveBeenCalled();
	});
});

describe("onCommunityPostRemoved", () => {
	it("tells the author, centre-only", async () => {
		await onCommunityPostRemoved({ organizationId: "org1", circlePostId: "p1" });
		expect(mockRecordActivity).toHaveBeenCalledWith({
			organizationId: "org1",
			recipientUserId: "author",
			actor: { userId: "system:moderation", name: null },
			item: {
				kind: "post_removed",
				groupKey: "post_removed:p1",
				title: "Your post was removed",
				body: "It didn't meet the community guidelines.",
				data: { screen: "spaceFeed", spaceId: "s1" },
				refId: "p1",
			},
		});
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it("looks the post up even when already soft-deleted", async () => {
		mockPostFindUnique.mockResolvedValue({ memberId: "m-author", circleSpaceId: "s1", excerpt: "x", deletedAt: new Date() });
		await onCommunityPostRemoved({ organizationId: "org1", circlePostId: "p1" });
		expect(mockRecordActivity).toHaveBeenCalled();
	});
});

it("hooks never throw", async () => {
	mockPostFindUnique.mockRejectedValue(new Error("db down"));
	await expect(onPostLiked({ organizationId: "org1", circlePostId: "p1", actor })).resolves.toBeUndefined();
	expect(mockLoggerError).toHaveBeenCalledWith("inbox.hook.failed", expect.objectContaining({ hook: "onPostLiked" }));
});
