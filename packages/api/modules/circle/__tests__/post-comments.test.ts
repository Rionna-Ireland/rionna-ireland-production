import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockMemberFindFirst,
	mockGetMemberToken,
	mockInvalidateMemberFeedCache,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockInvalidateMemberFeedCache: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
	},
	parseOrgMetadata: vi.fn(() => ({})),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({ getMemberToken: mockGetMemberToken })),
	getCircleHeadlessApiBaseUrl: vi.fn(() => "https://app.circle.so/api/headless/v1"),
}));

vi.mock("../lib/member-feed-cache", () => ({
	invalidateMemberFeedCache: mockInvalidateMemberFeedCache,
}));

import { addPostComment } from "../procedures/add-post-comment";
import { deletePostComment } from "../procedures/delete-post-comment";
import { getPostComments } from "../procedures/get-post-comments";

const ORG_ID = "org1";
const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: ORG_ID };
const ctx = { context: { headers: new Headers() } };

function jsonResponse(status: number, body: unknown = {}) {
	return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function commentRecord(id: number, overrides: Record<string, unknown> = {}) {
	return {
		id,
		parent_comment_id: null,
		replies: [],
		body_text: `Comment ${id}`,
		is_liked: false,
		user_likes_count: 0,
		created_at: "2026-07-27T10:00:00.000Z",
		author: { name: "Jane Member", avatar_url: null },
		policies: { can_destroy: false },
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
	mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
	mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
});

describe("getPostComments", () => {
	it("fetches page 1 oldest-first and returns parsed comments", async () => {
		const fetchSpy = vi.fn(async (_url: unknown, _init?: unknown) =>
			jsonResponse(200, {
				page: 1,
				per_page: 60,
				has_next_page: true,
				count: 61,
				records: [commentRecord(1), commentRecord(2)],
			}),
		);
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(
			getPostComments,
			{ organizationId: ORG_ID, postId: "34775788" },
			ctx,
		);

		expect(res.ok).toBe(true);
		expect(res.comments.map((comment) => comment.id)).toEqual(["1", "2"]);
		expect(res.hasNextPage).toBe(true);
		expect(res.totalCount).toBe(61);
		expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
			"https://app.circle.so/api/headless/v1/posts/34775788/comments?page=1&per_page=60&sort=oldest",
		);
		expect(fetchSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: expect.objectContaining({ Authorization: "Bearer jwt" }),
			}),
		);
	});

	it("passes the requested page through", async () => {
		const fetchSpy = vi.fn(async (_url: unknown, _init?: unknown) =>
			jsonResponse(200, { page: 2, has_next_page: false, count: 61, records: [] }),
		);
		vi.stubGlobal("fetch", fetchSpy);
		await call(getPostComments, { organizationId: ORG_ID, postId: "34775788", page: 2 }, ctx);
		expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("page=2");
	});

	it("returns ok:false on a Circle error status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(401)),
		);
		const res = await call(
			getPostComments,
			{ organizationId: ORG_ID, postId: "34775788" },
			ctx,
		);
		expect(res).toEqual({ ok: false, comments: [], hasNextPage: false, totalCount: null });
	});

	it("returns ok:false when the fetch throws / token fails / no circle member", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("down");
			}),
		);
		expect((await call(getPostComments, { organizationId: ORG_ID, postId: "1" }, ctx)).ok).toBe(
			false,
		);

		mockGetMemberToken.mockResolvedValue({ ok: false, reason: "mint_failed" });
		expect((await call(getPostComments, { organizationId: ORG_ID, postId: "1" }, ctx)).ok).toBe(
			false,
		);

		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
		mockMemberFindFirst.mockResolvedValue(null);
		expect((await call(getPostComments, { organizationId: ORG_ID, postId: "1" }, ctx)).ok).toBe(
			false,
		);
	});
});

describe("addPostComment", () => {
	it("POSTs the mandatory {comment:{...}} wrapper with a minimal tiptap doc", async () => {
		const fetchSpy = vi.fn(async (_url: unknown, _init?: unknown) =>
			jsonResponse(201, commentRecord(9001, { policies: { can_destroy: true } })),
		);
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(
			addPostComment,
			{ organizationId: ORG_ID, postId: "34775788", body: "Great run today!" },
			ctx,
		);

		expect(res.ok).toBe(true);
		expect(res.comment).toMatchObject({ id: "9001", canDelete: true });
		expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
			"https://app.circle.so/api/headless/v1/posts/34775788/comments",
		);
		const request = fetchSpy.mock.calls[0]?.[1] as { method: string; body: string };
		expect(request.method).toBe("POST");
		expect(JSON.parse(request.body)).toEqual({
			comment: {
				body: "Great run today!",
				tiptap_body: {
					body: {
						type: "doc",
						content: [
							{
								type: "paragraph",
								content: [{ type: "text", text: "Great run today!" }],
							},
						],
					},
				},
			},
		});
		expect(mockInvalidateMemberFeedCache).toHaveBeenCalledWith(USER.id, ORG_ID);
	});

	it("returns ok:false on 401/403 (auth or comments disabled) without invalidating", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(401, { message: "You cannot perform this action." })),
		);
		const res = await call(
			addPostComment,
			{ organizationId: ORG_ID, postId: "34775788", body: "hi" },
			ctx,
		);
		expect(res).toEqual({ ok: false, comment: null });
		expect(mockInvalidateMemberFeedCache).not.toHaveBeenCalled();
	});

	it("still reports ok when the 201 body is unparseable (comment landed)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(201, "weird")),
		);
		const res = await call(
			addPostComment,
			{ organizationId: ORG_ID, postId: "34775788", body: "hi" },
			ctx,
		);
		expect(res).toEqual({ ok: true, comment: null });
		expect(mockInvalidateMemberFeedCache).toHaveBeenCalled();
	});

	it("returns ok:false when the fetch throws (never a 500)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("down");
			}),
		);
		const res = await call(
			addPostComment,
			{ organizationId: ORG_ID, postId: "34775788", body: "hi" },
			ctx,
		);
		expect(res).toEqual({ ok: false, comment: null });
	});

	it("rejects an empty body at the input layer", async () => {
		vi.stubGlobal("fetch", vi.fn());
		await expect(
			call(addPostComment, { organizationId: ORG_ID, postId: "1", body: "   " }, ctx),
		).rejects.toThrow();
	});
});

describe("deletePostComment", () => {
	it("DELETEs the comment and invalidates the feed buffer", async () => {
		const fetchSpy = vi.fn(async (_url: unknown, _init?: unknown) =>
			jsonResponse(200, { success: true }),
		);
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(
			deletePostComment,
			{ organizationId: ORG_ID, postId: "34775788", commentId: "9001" },
			ctx,
		);

		expect(res).toEqual({ ok: true });
		expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
			"https://app.circle.so/api/headless/v1/posts/34775788/comments/9001",
		);
		expect((fetchSpy.mock.calls[0]?.[1] as { method: string }).method).toBe("DELETE");
		expect(mockInvalidateMemberFeedCache).toHaveBeenCalledWith(USER.id, ORG_ID);
	});

	it("returns ok:false on a Circle rejection", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(403)),
		);
		const res = await call(
			deletePostComment,
			{ organizationId: ORG_ID, postId: "34775788", commentId: "9001" },
			ctx,
		);
		expect(res).toEqual({ ok: false });
		expect(mockInvalidateMemberFeedCache).not.toHaveBeenCalled();
	});
});
