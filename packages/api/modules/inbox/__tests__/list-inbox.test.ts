import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindUnique, mockItemFindMany, mockUserFindMany } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindUnique: vi.fn(),
	mockItemFindMany: vi.fn(),
	mockUserFindMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		member: { findUnique: mockMemberFindUnique },
		inboxItem: { findMany: mockItemFindMany },
		user: { findMany: mockUserFindMany },
	},
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { encodeCursor } from "../lib/cursor";
import { listInbox } from "../procedures/list-inbox";

const ctx = { context: { headers: new Headers() } };
const row = (i: number, extra: Record<string, unknown> = {}) => ({
	id: `i${i}`,
	kind: "news",
	title: `Title ${i}`,
	body: "Body",
	imageUrl: null,
	actorUserId: null,
	actorName: null,
	actorCount: 1,
	data: { screen: "news", newsPostId: "slug" },
	readAt: null,
	updatedAt: new Date(Date.UTC(2026, 8, 15, 12, 0, 60 - i)),
	...extra,
});

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: { id: "u1", role: "user", name: "Me" } });
	mockMemberFindUnique.mockResolvedValue({ id: "m1", inboxUnseenCount: 0 });
	mockUserFindMany.mockResolvedValue([]);
});

describe("inbox.list", () => {
	it("returns a page ordered newest-first with a next cursor", async () => {
		mockItemFindMany.mockResolvedValue(Array.from({ length: 31 }, (_, i) => row(i)));
		const result = await call(listInbox, { organizationId: "org1" }, ctx);
		expect(mockItemFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { userId: "u1", organizationId: "org1" },
				orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
				take: 31,
			}),
		);
		expect(result.items).toHaveLength(30);
		expect(result.nextCursor).toBe(encodeCursor({ updatedAt: row(29).updatedAt, id: "i29" }));
		expect(result.items[0]).toEqual({
			id: "i0",
			kind: "news",
			icon: "club",
			title: "Title 0",
			body: "Body",
			imageUrl: null,
			actorAvatarUrl: null,
			data: { screen: "news", newsPostId: "slug" },
			unread: true,
			updatedAt: row(0).updatedAt.toISOString(),
		});
	});

	it("applies the keyset cursor", async () => {
		mockItemFindMany.mockResolvedValue([]);
		const cursor = encodeCursor({ updatedAt: new Date("2026-09-15T12:00:00Z"), id: "i5" });
		await call(listInbox, { organizationId: "org1", cursor }, ctx);
		expect(mockItemFindMany.mock.calls[0][0].where).toEqual({
			userId: "u1",
			organizationId: "org1",
			OR: [
				{ updatedAt: { lt: new Date("2026-09-15T12:00:00Z") } },
				{ updatedAt: new Date("2026-09-15T12:00:00Z"), id: { lt: "i5" } },
			],
		});
	});

	it("renders grouped kinds and resolves actor avatars", async () => {
		mockItemFindMany.mockResolvedValue([
			row(0, { kind: "post_like", actorUserId: "sarah", actorName: "Sarah", actorCount: 3, readAt: new Date() }),
		]);
		mockUserFindMany.mockResolvedValue([{ id: "sarah", image: "https://x/s.png" }]);
		const result = await call(listInbox, { organizationId: "org1" }, ctx);
		expect(result.items[0]).toMatchObject({
			icon: "actor",
			title: "Sarah and 2 others liked your post",
			actorAvatarUrl: "https://x/s.png",
			unread: false,
		});
		expect(mockUserFindMany).toHaveBeenCalledWith({ where: { id: { in: ["sarah"] } }, select: { id: true, image: true } });
	});

	it("drops rows with unknown kinds and returns empty for non-members", async () => {
		mockItemFindMany.mockResolvedValue([row(0, { kind: "retired_kind" })]);
		expect((await call(listInbox, { organizationId: "org1" }, ctx)).items).toEqual([]);
		mockMemberFindUnique.mockResolvedValue(null);
		expect(await call(listInbox, { organizationId: "org1" }, ctx)).toEqual({ items: [], nextCursor: null });
	});
});
