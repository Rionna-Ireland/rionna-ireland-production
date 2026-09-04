import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockMemberFindFirst,
	mockFindOwnCommunityPost,
	mockMarkCommunityPostDeleted,
	mockGetMemberToken,
	mockInvalidateMemberFeedCache,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockFindOwnCommunityPost: vi.fn(),
	mockMarkCommunityPostDeleted: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockInvalidateMemberFeedCache: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
	findOwnCommunityPost: mockFindOwnCommunityPost,
	markCommunityPostDeleted: mockMarkCommunityPostDeleted,
}));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: () => ({ getMemberToken: mockGetMemberToken }),
	getCircleHeadlessApiBaseUrl: () => "https://app.circle.so/api/headless/v1",
}));
vi.mock("../../circle/lib/member-feed-cache", () => ({
	invalidateMemberFeedCache: mockInvalidateMemberFeedCache,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { deletePost } from "../procedures/delete-post";

const USER = { id: "u1", role: "user", name: "Jane" };
const ctx = { context: { headers: new Headers() } };

const ORG_ID = "org1";
const SPACE_ID = "2825328";
const POST_ID = "34130292";

const baseInput = { organizationId: ORG_ID, spaceId: SPACE_ID, postId: POST_ID };

const METADATA = JSON.stringify({ features: { communityPosting: true } });

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: USER });
	mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "org-slug", metadata: METADATA });
	mockMemberFindFirst.mockResolvedValue({ id: "m1", circleMemberId: "cm1" });
	mockFindOwnCommunityPost.mockResolvedValue({ id: "row1", circlePostId: POST_ID });
	mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
});

describe("community.deletePost", () => {
	it("returns ok:false without any Circle call when communityPosting is killed", async () => {
		mockOrgFindUnique.mockResolvedValue({
			id: ORG_ID,
			slug: "org-slug",
			metadata: JSON.stringify({ features: { communityPosting: false } }),
		});
		vi.stubGlobal("fetch", vi.fn());
		const result = await call(deletePost, baseInput, ctx);
		expect(result).toEqual({ ok: false });
		expect(mockGetMemberToken).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
		expect(mockMarkCommunityPostDeleted).not.toHaveBeenCalled();
	});

	it("returns ok:false without a Circle call when there is no own CommunityPost row", async () => {
		mockFindOwnCommunityPost.mockResolvedValue(null);
		vi.stubGlobal("fetch", vi.fn());
		const result = await call(deletePost, baseInput, ctx);
		expect(result).toEqual({ ok: false });
		expect(fetch).not.toHaveBeenCalled();
		expect(mockMarkCommunityPostDeleted).not.toHaveBeenCalled();
	});

	it("happy path: DELETEs the Circle post, marks the row deleted, invalidates the feed cache", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", fetchMock);

		const result = await call(deletePost, baseInput, ctx);

		expect(fetchMock).toHaveBeenCalledWith(
			`https://app.circle.so/api/headless/v1/spaces/${SPACE_ID}/posts/${POST_ID}`,
			{ method: "DELETE", headers: { Authorization: "Bearer jwt" } },
		);
		expect(mockMarkCommunityPostDeleted).toHaveBeenCalledWith({
			circlePostId: POST_ID,
			deletedBy: "member",
		});
		expect(mockInvalidateMemberFeedCache).toHaveBeenCalledWith("u1", ORG_ID);
		expect(result).toEqual({ ok: true });
	});

	it("returns ok:false and leaves the row untouched on a Circle 401", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
		vi.stubGlobal("fetch", fetchMock);

		const result = await call(deletePost, baseInput, ctx);

		expect(result).toEqual({ ok: false });
		expect(mockMarkCommunityPostDeleted).not.toHaveBeenCalled();
		expect(mockInvalidateMemberFeedCache).not.toHaveBeenCalled();
	});
});
