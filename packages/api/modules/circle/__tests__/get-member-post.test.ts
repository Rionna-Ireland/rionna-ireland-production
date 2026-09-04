import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockMemberFindFirst, mockGetMemberToken } = vi.hoisted(
	() => ({
		mockGetSession: vi.fn(),
		mockOrgFindUnique: vi.fn(),
		mockMemberFindFirst: vi.fn(),
		mockGetMemberToken: vi.fn(),
	}),
);

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
	},
	parseOrgMetadata: vi.fn(() => ({ circle: { communityDomain: "community.rionna.com" } })),
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({ getMemberToken: mockGetMemberToken })),
	getCircleHeadlessApiBaseUrl: vi.fn(() => "https://app.circle.so/api/headless/v1"),
	buildCircleCommunityTargetUrl: vi.fn(() => "https://community.rionna.com/c/x/y"),
}));

import { getMemberPost } from "../procedures/get-member-post";

const ORG_ID = "org1";
const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: ORG_ID };
const ctx = { context: { headers: new Headers() } };

const POST = {
	id: 34130292,
	name: "Test Laska",
	body: { html: "<p>Hello</p>" },
	body_plain_text: "Hello",
	tiptap_body: {
		body: { type: "doc", content: [] },
		inline_attachments: [{ signed_id: "image-1", url: "https://img/post.jpg" }],
	},
	author: { name: "Jane", avatar_url: "https://img/a.png", community_member_id: "82236270" },
	space: { id: 2713068, name: "Laska", slug: "laska" },
	created_at: "2026-07-01T09:00:00Z",
	url: "https://community.rionna.com/c/laska/test-laska",
	comment_count: 8,
	user_likes_count: 13,
};

describe("getMemberPost", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
	});

	it("returns a normalized post from /spaces/{spaceId}/posts/{postId}", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => POST }));
		const res = await call(
			getMemberPost,
			{ organizationId: ORG_ID, spaceId: "2713068", postId: "34130292" },
			ctx,
		);
		expect(res).toMatchObject({
			id: "34130292",
			spaceId: "2713068",
			title: "Test Laska",
			bodyHtml: "<p>Hello</p>",
			authorName: "Jane",
			spaceName: "Laska",
			inlineAttachments: [{ signed_id: "image-1", url: "https://img/post.jpg" }],
			commentCount: 8,
			likeCount: 13,
			isOwn: true,
		});
	});

	it("sets isOwn to false when the post author is a different Circle member", async () => {
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "some-other-member" });
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => POST }));
		const res = await call(
			getMemberPost,
			{ organizationId: ORG_ID, spaceId: "2713068", postId: "34130292" },
			ctx,
		);
		expect(res).toMatchObject({ isOwn: false });
	});

	it("returns null on a 404 (missing/unauthorized post)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
		);
		const res = await call(
			getMemberPost,
			{ organizationId: ORG_ID, spaceId: "1", postId: "2" },
			ctx,
		);
		expect(res).toBeNull();
	});
});
