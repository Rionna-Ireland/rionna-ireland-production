/**
 * notifyCommunityMembers — best-effort NEWS_POST push (org-wide, newsPost pref)
 * fired when an admin publishes a community announcement with "Notify members"
 * checked. Same Expo trigger as website news; triggerRefId is the memberPost
 * id so PushLog dedup does not collide with NewsPost rows.
 *
 * S12-06: an org-wide inbox item is always recorded, even on a quiet publish
 * (`push: false`) — only the push is gated.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendPush, mockRecordInbox } = vi.hoisted(() => ({
	mockSendPush: vi.fn(),
	mockRecordInbox: vi.fn(),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../push/service", () => ({
	sendPush: mockSendPush,
}));

vi.mock("../../../inbox/record", () => ({
	recordInbox: mockRecordInbox,
}));

import { notifyCommunityMembers } from "../notify-community-members";

beforeEach(() => {
	vi.clearAllMocks();
	mockRecordInbox.mockResolvedValue(new Map([["u1", 2]]));
});

describe("notifyCommunityMembers", () => {
	it("fires an org-wide NEWS_POST push (no follower filter)", async () => {
		mockSendPush.mockResolvedValue({ attempted: 2, sent: 2, failed: 0 });

		await notifyCommunityMembers({
			organizationId: "org-1",
			memberPostId: "mp-1",
			title: "Club dinner Friday",
			circlePostUrl: "https://rionna.circle.so/posts/5001",
			circleSpaceId: "s1",
			circlePostId: "cp1",
		});

		expect(mockSendPush).toHaveBeenCalledWith({
			organizationId: "org-1",
			triggerType: "NEWS_POST",
			triggerRefId: "mp-1",
			title: "Club dinner Friday",
			body: "New announcement for all members.",
			data: {
				screen: "community",
				url: "https://rionna.circle.so/posts/5001",
				spaceId: "s1",
				postId: "cp1",
			},
			badgeByUserId: new Map([["u1", 2]]),
		});
		expect(mockSendPush.mock.calls[0][0]).not.toHaveProperty("followersOfHorseId");
	});

	it("records the inbox item with the post deep link and passes badges to the push", async () => {
		mockSendPush.mockResolvedValue({ attempted: 1, sent: 1, failed: 0 });

		await notifyCommunityMembers({
			organizationId: "org-1",
			memberPostId: "mp-1",
			title: "Club dinner Friday",
			circleSpaceId: "s1",
			circlePostId: "cp1",
		});

		expect(mockRecordInbox).toHaveBeenCalledWith({
			organizationId: "org-1",
			audience: { kind: "org" },
			item: expect.objectContaining({
				kind: "announcement",
				groupKey: "announcement:mp-1",
				title: "Club dinner Friday",
				body: "New announcement for all members.",
				data: { screen: "post", spaceId: "s1", postId: "cp1" },
			}),
		});
		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({ badgeByUserId: new Map([["u1", 2]]) }),
		);
	});

	it("records but does not push on a quiet publish", async () => {
		await notifyCommunityMembers({
			organizationId: "org-1",
			memberPostId: "mp-1",
			title: "Club dinner Friday",
			circleSpaceId: "s1",
			circlePostId: "cp1",
			push: false,
		});

		expect(mockRecordInbox).toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it("omits the url when no Circle post URL is available", async () => {
		mockSendPush.mockResolvedValue({ attempted: 1, sent: 1, failed: 0 });

		await notifyCommunityMembers({
			organizationId: "org-1",
			memberPostId: "mp-1",
			title: "Club dinner Friday",
			circleSpaceId: "s1",
			circlePostId: "cp1",
		});

		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({
				data: { screen: "community", spaceId: "s1", postId: "cp1" },
			}),
		);
	});

	it("never throws when sendPush itself throws — the publish already committed", async () => {
		mockSendPush.mockRejectedValue(new Error("db unavailable"));

		await expect(
			notifyCommunityMembers({
				organizationId: "org-1",
				memberPostId: "mp-1",
				title: "Title",
				circleSpaceId: "s1",
				circlePostId: "cp1",
			}),
		).resolves.toBeUndefined();
	});

	it("never throws when delivery fails for the whole audience", async () => {
		mockSendPush.mockResolvedValue({ attempted: 3, sent: 0, failed: 3 });

		await expect(
			notifyCommunityMembers({
				organizationId: "org-1",
				memberPostId: "mp-1",
				title: "Title",
				circleSpaceId: "s1",
				circlePostId: "cp1",
			}),
		).resolves.toBeUndefined();
	});
});
