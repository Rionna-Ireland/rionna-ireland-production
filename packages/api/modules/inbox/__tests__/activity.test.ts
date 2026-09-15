import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockUpdate, mockUpdateMany, mockMemberUpdate, mockMemberFindUnique, mockLoggerError } = vi.hoisted(() => ({
	mockCreate: vi.fn(),
	mockUpdate: vi.fn(),
	mockUpdateMany: vi.fn(),
	mockMemberUpdate: vi.fn(),
	mockMemberFindUnique: vi.fn(),
	mockLoggerError: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		inboxItem: { create: mockCreate, update: mockUpdate, updateMany: mockUpdateMany },
		member: { update: mockMemberUpdate, findUnique: mockMemberFindUnique },
	},
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: mockLoggerError } }));

import { COMMENT_PUSH_THROTTLE_MS, recordActivity } from "../activity";

const NOW = new Date("2026-09-15T12:00:00Z");
const base = {
	organizationId: "org1",
	recipientUserId: "author",
	actor: { userId: "sarah", name: "Sarah" },
	item: {
		kind: "post_comment" as const,
		groupKey: "comments:p1",
		title: "",
		body: "Great run!",
		data: { screen: "post" as const, spaceId: "s1", postId: "p1" },
		refId: "p1",
	},
	now: NOW,
};
const uniqueError = Object.assign(new Error("unique"), { code: "P2002" });

beforeEach(() => {
	vi.clearAllMocks();
	mockCreate.mockResolvedValue({ id: "i1" });
	mockUpdate.mockResolvedValue({ id: "i1" });
	mockUpdateMany.mockResolvedValue({ count: 1 });
	mockMemberUpdate.mockResolvedValue({ inboxUnseenCount: 5 });
	mockMemberFindUnique.mockResolvedValue({ inboxUnseenCount: 2 });
});

describe("recordActivity", () => {
	it("skips self-actions", async () => {
		expect(await recordActivity({ ...base, actor: { userId: "author", name: "Me" } })).toBeNull();
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("creates the grouped row and bumps the badge", async () => {
		const result = await recordActivity(base);
		expect(mockCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ organizationId: "org1", userId: "author", kind: "post_comment", groupKey: "comments:p1", actorUserId: "sarah", actorName: "Sarah" }),
		});
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { organizationId_userId: { organizationId: "org1", userId: "author" } },
			data: { inboxUnseenCount: { increment: 1 } },
			select: { inboxUnseenCount: true },
		});
		expect(result).toEqual({ unseenCount: 5, shouldPush: false, pushedAt: null });
	});

	it("regroups an existing row and bumps for likes/comments", async () => {
		mockCreate.mockRejectedValue(uniqueError);
		await recordActivity(base);
		expect(mockUpdate).toHaveBeenCalledWith({
			where: { userId_groupKey: { userId: "author", groupKey: "comments:p1" } },
			data: expect.objectContaining({ readAt: null, body: "Great run!", actorUserId: "sarah", actorName: "Sarah", actorCount: { increment: 1 } }),
		});
		expect(mockMemberUpdate).toHaveBeenCalled();
	});

	it("regroups post_removed without a badge bump", async () => {
		mockCreate.mockRejectedValue(uniqueError);
		const result = await recordActivity({ ...base, item: { ...base.item, kind: "post_removed", groupKey: "post_removed:p1" } });
		expect(mockMemberUpdate).not.toHaveBeenCalled();
		expect(result?.unseenCount).toBe(2);
	});

	it("claims the push window atomically", async () => {
		const result = await recordActivity({ ...base, throttlePushMs: COMMENT_PUSH_THROTTLE_MS });
		expect(mockUpdateMany).toHaveBeenCalledWith({
			where: {
				userId: "author",
				groupKey: "comments:p1",
				OR: [{ lastPushedAt: null }, { lastPushedAt: { lt: new Date(NOW.getTime() - COMMENT_PUSH_THROTTLE_MS) } }],
			},
			data: { lastPushedAt: NOW },
		});
		expect(result).toEqual({ unseenCount: 5, shouldPush: true, pushedAt: NOW });
	});

	it("does not push inside the window", async () => {
		mockUpdateMany.mockResolvedValue({ count: 0 });
		const result = await recordActivity({ ...base, throttlePushMs: COMMENT_PUSH_THROTTLE_MS });
		expect(result).toEqual({ unseenCount: 5, shouldPush: false, pushedAt: null });
	});

	it("never throws", async () => {
		mockCreate.mockRejectedValue(new Error("db down"));
		expect(await recordActivity(base)).toBeNull();
		expect(mockLoggerError).toHaveBeenCalledWith("inbox.activity.failed", expect.objectContaining({ groupKey: "comments:p1" }));
	});
});
