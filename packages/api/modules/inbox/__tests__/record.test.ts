import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateMany, mockItemUpdateMany, mockMemberUpdateMany, mockMemberFindMany, mockResolve, mockLoggerError } =
	vi.hoisted(() => ({
		mockCreateMany: vi.fn(),
		mockItemUpdateMany: vi.fn(),
		mockMemberUpdateMany: vi.fn(),
		mockMemberFindMany: vi.fn(),
		mockResolve: vi.fn(),
		mockLoggerError: vi.fn(),
	}));

vi.mock("@repo/database", () => ({
	db: {
		inboxItem: { createManyAndReturn: mockCreateMany, updateMany: mockItemUpdateMany },
		member: { updateMany: mockMemberUpdateMany, findMany: mockMemberFindMany },
	},
}));
vi.mock("../audience", () => ({ resolveInboxUserIds: mockResolve }));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: mockLoggerError } }));

import { INBOX_BATCH_SIZE, recordInbox } from "../record";

const item = {
	kind: "news" as const,
	groupKey: "news:n1",
	title: "New post: Hello",
	body: "Sub",
	data: { screen: "news" as const, newsPostId: "hello" },
	refId: "n1",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockResolve.mockResolvedValue(["u1", "u2"]);
	mockCreateMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
	mockItemUpdateMany.mockResolvedValue({ count: 0 });
	mockMemberUpdateMany.mockResolvedValue({ count: 2 });
	mockMemberFindMany.mockResolvedValue([
		{ userId: "u1", inboxUnseenCount: 3 },
		{ userId: "u2", inboxUnseenCount: 1 },
	]);
});

describe("recordInbox", () => {
	it("inserts one row per recipient, bumps their counters and returns badges", async () => {
		const badges = await recordInbox({ organizationId: "org1", audience: { kind: "org" }, item });

		expect(mockCreateMany).toHaveBeenCalledWith({
			data: [
				expect.objectContaining({
					organizationId: "org1",
					userId: "u1",
					kind: "news",
					groupKey: "news:n1",
					title: "New post: Hello",
					body: "Sub",
					data: item.data,
					refId: "n1",
				}),
				expect.objectContaining({ userId: "u2" }),
			],
			skipDuplicates: true,
			select: { userId: true },
		});
		expect(mockMemberUpdateMany).toHaveBeenCalledWith({
			where: { organizationId: "org1", userId: { in: ["u1", "u2"] } },
			data: { inboxUnseenCount: { increment: 1 } },
		});
		expect(badges).toEqual(
			new Map([
				["u1", 3],
				["u2", 1],
			]),
		);
	});

	it("treats a retry as a no-op but still returns current badges", async () => {
		mockCreateMany.mockResolvedValue([]);
		const badges = await recordInbox({ organizationId: "org1", audience: { kind: "org" }, item });
		expect(mockMemberUpdateMany).not.toHaveBeenCalled();
		expect(mockItemUpdateMany).not.toHaveBeenCalled();
		expect(badges.get("u1")).toBe(3);
	});

	it("regroups existing rows without bumping the badge for horse_posts", async () => {
		mockCreateMany.mockResolvedValue([{ userId: "u2" }]);
		await recordInbox({
			organizationId: "org1",
			audience: { kind: "horseFollowers", horseId: "h1" },
			excludeUserId: "author",
			item: {
				...item,
				kind: "horse_posts",
				groupKey: "horsePosts:h1:2026-09-15",
				actorUserId: "author",
				actorName: "Sarah",
			},
			regroup: true,
		});
		expect(mockResolve).toHaveBeenCalledWith("org1", { kind: "horseFollowers", horseId: "h1" }, "author");
		expect(mockItemUpdateMany).toHaveBeenCalledWith({
			where: { userId: { in: ["u1"] }, groupKey: "horsePosts:h1:2026-09-15" },
			data: expect.objectContaining({ readAt: null, actorUserId: "author", actorName: "Sarah", actorCount: { increment: 1 } }),
		});
		expect(mockMemberUpdateMany).toHaveBeenCalledWith({
			where: { organizationId: "org1", userId: { in: ["u2"] } },
			data: { inboxUnseenCount: { increment: 1 } },
		});
	});

	it("batches large audiences", async () => {
		const ids = Array.from({ length: INBOX_BATCH_SIZE + 1 }, (_, i) => `u${i}`);
		mockResolve.mockResolvedValue(ids);
		mockCreateMany.mockResolvedValue([]);
		mockMemberFindMany.mockResolvedValue([]);
		await recordInbox({ organizationId: "org1", audience: { kind: "org" }, item });
		expect(mockCreateMany).toHaveBeenCalledTimes(2);
		expect(mockCreateMany.mock.calls[1][0].data).toHaveLength(1);
	});

	it("returns an empty map and skips writes for an empty audience", async () => {
		mockResolve.mockResolvedValue([]);
		expect(await recordInbox({ organizationId: "org1", audience: { kind: "org" }, item })).toEqual(new Map());
		expect(mockCreateMany).not.toHaveBeenCalled();
	});

	it("never throws", async () => {
		mockCreateMany.mockRejectedValue(new Error("db down"));
		await expect(recordInbox({ organizationId: "org1", audience: { kind: "org" }, item })).resolves.toEqual(new Map());
		expect(mockLoggerError).toHaveBeenCalledWith("inbox.record.failed", expect.objectContaining({ groupKey: "news:n1" }));
	});
});
