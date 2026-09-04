import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockMemberFindFirst,
	mockUserFindUnique,
	mockCountRecentCommunityPosts,
	mockCreateCommunityPost,
	mockCreateModerationFlag,
	mockGetMemberToken,
	mockCreatePost,
	mockSerializeNovelDocToCircle,
	mockGetMemberSpacesCached,
	mockFetchMemberSpaces,
	mockWriteMemberSpacesCache,
	mockInvalidateMemberFeedCache,
	mockFetchImageBytes,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockUserFindUnique: vi.fn(),
	mockCountRecentCommunityPosts: vi.fn(),
	mockCreateCommunityPost: vi.fn(),
	mockCreateModerationFlag: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockCreatePost: vi.fn(),
	mockSerializeNovelDocToCircle: vi.fn(),
	mockGetMemberSpacesCached: vi.fn(),
	mockFetchMemberSpaces: vi.fn(),
	mockWriteMemberSpacesCache: vi.fn(),
	mockInvalidateMemberFeedCache: vi.fn(),
	mockFetchImageBytes: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
		user: { findUnique: mockUserFindUnique },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
	countRecentCommunityPosts: mockCountRecentCommunityPosts,
	createCommunityPost: mockCreateCommunityPost,
	createModerationFlag: mockCreateModerationFlag,
}));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: () => ({ getMemberToken: mockGetMemberToken, createPost: mockCreatePost }),
	serializeNovelDocToCircle: mockSerializeNovelDocToCircle,
}));
vi.mock("../lib/member-spaces", () => ({
	getMemberSpacesCached: mockGetMemberSpacesCached,
	fetchMemberSpaces: mockFetchMemberSpaces,
	writeMemberSpacesCache: mockWriteMemberSpacesCache,
}));
vi.mock("../../circle/lib/member-feed-cache", () => ({
	invalidateMemberFeedCache: mockInvalidateMemberFeedCache,
}));
vi.mock("../../member-posts/lib/fetch-image-bytes", () => ({
	fetchImageBytes: mockFetchImageBytes,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { createPost } from "../procedures/create-post";

const USER = { id: "u1", role: "user", name: "Jane" };
const ctx = { context: { headers: new Headers() } };

const SPACE_ID = "2825328";

const METADATA = JSON.stringify({
	circle: { spaces: { [SPACE_ID]: { memberPosting: true } } },
});

const SPACES = [
	{
		id: SPACE_ID,
		name: "Inside Track",
		emoji: "🏇",
		canCreatePost: true,
		isMember: true,
		spaceGroupId: null,
		isPostDisabled: false,
		spaceType: "basic",
	},
];

const baseInput = {
	organizationId: "org1",
	spaceId: SPACE_ID,
	title: "Great day at the track",
	body: "Had a wonderful time watching the horses run today.",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: USER });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "org-slug", metadata: METADATA });
	mockMemberFindFirst.mockResolvedValue({ id: "m1", circleMemberId: "cm1" });
	mockUserFindUnique.mockResolvedValue({ email: "jane@x.ie" });
	mockGetMemberSpacesCached.mockReturnValue(SPACES);
	mockCountRecentCommunityPosts.mockResolvedValue(0);
	mockSerializeNovelDocToCircle.mockResolvedValue({
		ok: true,
		tiptapBody: { body: { type: "doc", content: [] } },
		attachments: [],
	});
	mockCreatePost.mockResolvedValue({ ok: true, data: { circlePostId: "cp1", status: "published" } });
	mockCreateCommunityPost.mockResolvedValue({ id: "row1" });
});

describe("community.createPost", () => {
	it("returns not_allowed when the space isn't in the org allow-list", async () => {
		mockOrgFindUnique.mockResolvedValue({
			id: "org1",
			slug: "org-slug",
			metadata: JSON.stringify({ circle: { spaces: {} } }),
		});
		const result = await call(createPost, baseInput, ctx);
		expect(result).toEqual({ ok: false, reason: "not_allowed" });
		expect(mockCreatePost).not.toHaveBeenCalled();
	});

	it("returns not_allowed when allowed but canCreatePost is false", async () => {
		mockGetMemberSpacesCached.mockReturnValue([{ ...SPACES[0], canCreatePost: false }]);
		const result = await call(createPost, baseInput, ctx);
		expect(result).toEqual({ ok: false, reason: "not_allowed" });
		expect(mockCreatePost).not.toHaveBeenCalled();
	});

	it("returns blocked and records the flag when the title has a blocked word", async () => {
		const result = await call(
			createPost,
			{ ...baseInput, title: "fuck this is great", body: "This is a totally fine post body." },
			ctx,
		);
		expect(result).toEqual({ ok: false, reason: "blocked" });
		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockCreateModerationFlag).toHaveBeenCalledWith(
			expect.objectContaining({ source: "blocked", surface: "post" }),
		);
	});

	it("returns rate_limited at 5 posts in the last hour", async () => {
		mockCountRecentCommunityPosts.mockImplementation((p: { since: Date }) => {
			// hour window is the tighter one: since = now - 1h
			const isHourWindow = Date.now() - p.since.getTime() <= 60 * 60 * 1000 + 1000;
			return Promise.resolve(isHourWindow ? 5 : 5);
		});
		const result = await call(createPost, baseInput, ctx);
		expect(result).toEqual({ ok: false, reason: "rate_limited" });
		expect(mockCreatePost).not.toHaveBeenCalled();
	});

	it("returns rate_limited at 20 posts in the last day", async () => {
		mockCountRecentCommunityPosts.mockImplementation((p: { since: Date }) => {
			const isHourWindow = Date.now() - p.since.getTime() <= 60 * 60 * 1000 + 1000;
			return Promise.resolve(isHourWindow ? 0 : 20);
		});
		const result = await call(createPost, baseInput, ctx);
		expect(result).toEqual({ ok: false, reason: "rate_limited" });
		expect(mockCreatePost).not.toHaveBeenCalled();
	});

	it("happy path: creates the Circle post, the CommunityPost row, and invalidates the feed cache", async () => {
		const result = await call(createPost, baseInput, ctx);

		expect(mockCreatePost).toHaveBeenCalledWith(
			expect.objectContaining({
				spaceId: SPACE_ID,
				name: baseInput.title,
				authorEmail: "jane@x.ie",
				tiptapBody: { body: { type: "doc", content: [] } },
				attachments: [],
				idempotencyKey: expect.any(String),
			}),
		);
		expect(mockCreateCommunityPost).toHaveBeenCalled();
		expect(mockInvalidateMemberFeedCache).toHaveBeenCalledWith("u1", "org1");
		expect(result).toEqual({ ok: true, post: { circlePostId: "cp1", spaceId: SPACE_ID } });
	});

	it("returns image_failed when serialization fails", async () => {
		mockSerializeNovelDocToCircle.mockResolvedValue({ ok: false, reason: "image_fetch_failed" });
		const result = await call(createPost, baseInput, ctx);
		expect(result).toEqual({ ok: false, reason: "image_failed" });
		expect(mockCreatePost).not.toHaveBeenCalled();
	});

	it("returns circle_failed when the Circle create-post call fails", async () => {
		mockCreatePost.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });
		const result = await call(createPost, baseInput, ctx);
		expect(result).toEqual({ ok: false, reason: "circle_failed" });
		expect(mockCreateCommunityPost).not.toHaveBeenCalled();
	});

	it("rejects an empty title with a short body via zod", async () => {
		await expect(
			call(createPost, { ...baseInput, title: "", body: "short" }, ctx),
		).rejects.toBeTruthy();
		expect(mockCreatePost).not.toHaveBeenCalled();
	});
});
