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

import { setPostLike } from "../procedures/set-post-like";

const ORG_ID = "org1";
const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: ORG_ID };
const ctx = { context: { headers: new Headers() } };

function jsonResponse(status: number, body: Record<string, unknown> = {}) {
	return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("setPostLike", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
	});

	it("likes a post via POST and invalidates the member's feed buffer", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse(200, { user_likes_count: 6 }));
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(
			setPostLike,
			{ organizationId: ORG_ID, postId: "34130292", liked: true },
			ctx,
		);

		expect(res).toEqual({ ok: true, liked: true, likeCount: 6 });
		expect(fetchSpy).toHaveBeenCalledWith(
			"https://app.circle.so/api/headless/v1/posts/34130292/user_likes",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({ Authorization: "Bearer jwt" }),
			}),
		);
		expect(mockInvalidateMemberFeedCache).toHaveBeenCalledWith(USER.id, ORG_ID);
	});

	it("unlikes a post via DELETE", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse(200));
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(
			setPostLike,
			{ organizationId: ORG_ID, postId: "34130292", liked: false },
			ctx,
		);

		expect(res).toEqual({ ok: true, liked: false, likeCount: null });
		expect(fetchSpy).toHaveBeenCalledWith(
			"https://app.circle.so/api/headless/v1/posts/34130292/user_likes",
			expect.objectContaining({ method: "DELETE" }),
		);
		expect(mockInvalidateMemberFeedCache).toHaveBeenCalledWith(USER.id, ORG_ID);
	});

	it("treats an already-liked 4xx as success (idempotent)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(422, { message: "You have already liked this post" })),
		);

		const res = await call(
			setPostLike,
			{ organizationId: ORG_ID, postId: "34130292", liked: true },
			ctx,
		);

		expect(res).toEqual({ ok: true, liked: true, likeCount: null });
		expect(mockInvalidateMemberFeedCache).toHaveBeenCalledWith(USER.id, ORG_ID);
	});

	it("returns ok:false on 401/403 (auth problem, not idempotency)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(401)),
		);
		const res = await call(
			setPostLike,
			{ organizationId: ORG_ID, postId: "34130292", liked: true },
			ctx,
		);
		expect(res).toEqual({ ok: false, liked: true, likeCount: null });
		expect(mockInvalidateMemberFeedCache).not.toHaveBeenCalled();
	});

	it("returns ok:false on a Circle 5xx", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(500)),
		);
		const res = await call(
			setPostLike,
			{ organizationId: ORG_ID, postId: "34130292", liked: true },
			ctx,
		);
		expect(res).toEqual({ ok: false, liked: true, likeCount: null });
	});

	it("returns ok:false when the fetch throws (never a 500)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network down");
			}),
		);
		const res = await call(
			setPostLike,
			{ organizationId: ORG_ID, postId: "34130292", liked: true },
			ctx,
		);
		expect(res).toEqual({ ok: false, liked: true, likeCount: null });
	});

	it("returns ok:false when the token mint fails", async () => {
		mockGetMemberToken.mockResolvedValue({ ok: false, reason: "mint_failed" });
		vi.stubGlobal("fetch", vi.fn());
		const res = await call(
			setPostLike,
			{ organizationId: ORG_ID, postId: "34130292", liked: true },
			ctx,
		);
		expect(res).toEqual({ ok: false, liked: true, likeCount: null });
	});

	it("returns ok:false when the member has no circleMemberId", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		vi.stubGlobal("fetch", vi.fn());
		const res = await call(
			setPostLike,
			{ organizationId: ORG_ID, postId: "34130292", liked: true },
			ctx,
		);
		expect(res).toEqual({ ok: false, liked: true, likeCount: null });
	});

	it("encodes the post id into the path", async () => {
		const fetchSpy = vi.fn(async (_url: unknown) => jsonResponse(200));
		vi.stubGlobal("fetch", fetchSpy);
		await call(setPostLike, { organizationId: ORG_ID, postId: "a/b", liked: true }, ctx);
		expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/posts/a%2Fb/user_likes");
	});
});
