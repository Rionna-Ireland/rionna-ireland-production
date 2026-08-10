import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockMemberFindFirst,
	mockHorseFindFirst,
	mockGetMemberToken,
	mockInvalidateMemberFeedCache,
	mockSyncCircleSpaceMembership,
	mockParseOrgMetadata,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockHorseFindFirst: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockInvalidateMemberFeedCache: vi.fn(),
	mockSyncCircleSpaceMembership: vi.fn(),
	mockParseOrgMetadata: vi.fn(() => ({})),
}));

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
		horse: { findFirst: mockHorseFindFirst },
	},
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({ getMemberToken: mockGetMemberToken })),
	getCircleHeadlessApiBaseUrl: vi.fn(() => "https://app.circle.so/api/headless/v1"),
}));

vi.mock("@repo/payments/lib/circle-space-membership", () => ({
	syncCircleSpaceMembership: mockSyncCircleSpaceMembership,
}));

vi.mock("../lib/member-feed-cache", () => ({
	invalidateMemberFeedCache: mockInvalidateMemberFeedCache,
}));

import { setPostLike } from "../procedures/set-post-like";

const ORG_ID = "org1";
const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: ORG_ID };
const ctx = { context: { headers: new Headers() } };
const SPACE_ID = "space-42";
const HORSE_ID = "horse-1";

function jsonResponse(status: number, body: Record<string, unknown> = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body),
	};
}

describe("setPostLike", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockHorseFindFirst.mockResolvedValue(null);
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
		mockSyncCircleSpaceMembership.mockResolvedValue({ ok: true });
		mockParseOrgMetadata.mockReturnValue({});
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

	describe("S8-04 §2 join-on-like self-heal", () => {
		it("401 -> join -> retry succeeds", async () => {
			mockHorseFindFirst.mockResolvedValue({ id: HORSE_ID });
			const fetchSpy = vi
				.fn()
				.mockResolvedValueOnce(jsonResponse(401, { message: "You cannot perform this action." }))
				.mockResolvedValueOnce(jsonResponse(200, { user_likes_count: 3 }));
			vi.stubGlobal("fetch", fetchSpy);

			const res = await call(
				setPostLike,
				{ organizationId: ORG_ID, postId: "34130292", liked: true, spaceId: SPACE_ID },
				ctx,
			);

			expect(res).toEqual({ ok: true, liked: true, likeCount: 3 });
			expect(fetchSpy).toHaveBeenCalledTimes(2);
			expect(mockSyncCircleSpaceMembership).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				userId: USER.id,
				horseId: HORSE_ID,
				action: "join",
			});
			expect(mockInvalidateMemberFeedCache).toHaveBeenCalledWith(USER.id, ORG_ID);
		});

		it("401 -> join -> retry still 401 -> ok:false", async () => {
			mockHorseFindFirst.mockResolvedValue({ id: HORSE_ID });
			const fetchSpy = vi
				.fn()
				.mockResolvedValueOnce(jsonResponse(401, { message: "still no" }))
				.mockResolvedValueOnce(jsonResponse(401, { message: "still no" }));
			vi.stubGlobal("fetch", fetchSpy);

			const res = await call(
				setPostLike,
				{ organizationId: ORG_ID, postId: "34130292", liked: true, spaceId: SPACE_ID },
				ctx,
			);

			expect(res).toEqual({ ok: false, liked: true, likeCount: null });
			// Exactly one like attempt + one retry — the join is never attempted a
			// second time even though we loop back through the 401 branch again.
			expect(fetchSpy).toHaveBeenCalledTimes(2);
			expect(mockSyncCircleSpaceMembership).toHaveBeenCalledTimes(1);
		});

		it("join is attempted at most once even if the join call itself fails", async () => {
			mockHorseFindFirst.mockResolvedValue({ id: HORSE_ID });
			mockSyncCircleSpaceMembership.mockResolvedValue({ ok: false });
			const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(401, { message: "nope" }));
			vi.stubGlobal("fetch", fetchSpy);

			const res = await call(
				setPostLike,
				{ organizationId: ORG_ID, postId: "34130292", liked: true, spaceId: SPACE_ID },
				ctx,
			);

			expect(res).toEqual({ ok: false, liked: true, likeCount: null });
			// Join failed, so no retry fetch — only the original like attempt.
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			expect(mockSyncCircleSpaceMembership).toHaveBeenCalledTimes(1);
		});

		it("non-horse space skips the join (no active horse maps to spaceId)", async () => {
			mockHorseFindFirst.mockResolvedValue(null);
			const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(401, { message: "nope" }));
			vi.stubGlobal("fetch", fetchSpy);

			const res = await call(
				setPostLike,
				{ organizationId: ORG_ID, postId: "34130292", liked: true, spaceId: SPACE_ID },
				ctx,
			);

			expect(res).toEqual({ ok: false, liked: true, likeCount: null });
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
		});

		it("skips the join when spaceId is omitted (unchanged fail-safe path)", async () => {
			const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(401));
			vi.stubGlobal("fetch", fetchSpy);

			const res = await call(
				setPostLike,
				{ organizationId: ORG_ID, postId: "34130292", liked: true },
				ctx,
			);

			expect(res).toEqual({ ok: false, liked: true, likeCount: null });
			expect(mockHorseFindFirst).not.toHaveBeenCalled();
			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
		});

		it("skips the join when features.horseFollows is disabled", async () => {
			mockParseOrgMetadata.mockReturnValue({ features: { horseFollows: false } });
			mockHorseFindFirst.mockResolvedValue({ id: HORSE_ID });
			const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(401));
			vi.stubGlobal("fetch", fetchSpy);

			const res = await call(
				setPostLike,
				{ organizationId: ORG_ID, postId: "34130292", liked: true, spaceId: SPACE_ID },
				ctx,
			);

			expect(res).toEqual({ ok: false, liked: true, likeCount: null });
			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
		});
	});
});
