import { call } from "@orpc/server";
import type { OrganizationMetadata } from "@repo/database/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockMemberFindFirst,
	mockMemberFindMany,
	mockTrainerFindMany,
	mockAttrFindMany,
	mockGetFeatured,
	mockParseOrgMetadata,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockTrainerFindMany: vi.fn(),
	mockAttrFindMany: vi.fn(),
	mockGetFeatured: vi.fn(),
	mockParseOrgMetadata: vi.fn(
		(): OrganizationMetadata => ({ circle: { communitySpaceId: "10" } }),
	),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: vi.fn(async () => ({ id: "org1", slug: "rionna", metadata: null })) },
		member: { findFirst: mockMemberFindFirst, findMany: mockMemberFindMany },
		trainer: { findMany: mockTrainerFindMany },
		postAttribution: { findMany: mockAttrFindMany },
		horse: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
	},
	parseOrgMetadata: mockParseOrgMetadata,
	getVisiblePolls: vi.fn(async () => []),
}));
vi.mock("../../polls/lib/build-poll-cards", () => ({ buildPollCards: vi.fn(async () => []) }));
vi.mock("../lib/story-feed-items", () => ({ getStoryFeedItems: vi.fn(async () => []) }));
vi.mock("../lib/featured-qa", () => ({ getFeaturedQa: mockGetFeatured }));
vi.mock("../../racing/horses/lib/horse-follows", () => ({
	getFollowedHorseIds: vi.fn(async () => new Set()),
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({
		getMemberToken: vi.fn(async () => ({ ok: true, data: { accessToken: "jwt" } })),
	})),
	getCircleHeadlessApiBaseUrl: vi.fn(() => "https://app.circle.so/api/headless/v1"),
	buildCircleCommunityTargetUrl: vi.fn(() => null),
}));

import { clearMemberFeedCache } from "../lib/member-feed-cache";
import { getMemberFeed } from "../procedures/get-member-feed";

const ctx = { context: { headers: new Headers() } };

function author(id: number, name: string) {
	return { id, community_member_id: id, name, avatar_url: `https://x/${id}.png` };
}
const SPACE_POSTS: Record<string, unknown[]> = {
	9: [{ id: 1, name: "Yard note", created_at: "2026-07-01T08:00:00Z", author: author(501, "Ger") }],
	10: [
		{
			id: 2,
			name: "Club news",
			created_at: "2026-07-01T09:00:00Z",
			author: author(502, "Admin Amy"),
		},
	],
};

beforeEach(() => {
	vi.clearAllMocks();
	clearMemberFeedCache();
	mockGetSession.mockResolvedValue({
		user: { id: "u1", role: "user" },
		session: { id: "s1", activeOrganizationId: "org1" },
	});
	mockMemberFindFirst.mockResolvedValue({ circleMemberId: "900" });
	mockMemberFindMany.mockResolvedValue([]);
	mockTrainerFindMany.mockResolvedValue([]);
	mockAttrFindMany.mockResolvedValue([]);
	mockGetFeatured.mockResolvedValue(null);
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: unknown) => {
			const u = String(url);
			if (u.includes("/spaces?")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						records: [
							{ id: 9, name: "Laska", slug: "laska", space_type: "basic" },
							{ id: 10, name: "Official Announcements", slug: "ann", space_type: "basic" },
						],
					}),
				};
			}
			const m = u.match(/\/spaces\/(\d+)\/posts/);
			return { ok: true, status: 200, json: async () => ({ records: SPACE_POSTS[m?.[1] ?? ""] ?? [] }) };
		}),
	);
});

describe("getMemberFeed S13-11 additions", () => {
	it("flags announcements by communitySpaceId and stamps staff/trainer roles", async () => {
		mockMemberFindMany.mockResolvedValue([
			{ circleMemberId: "501", userId: "uT", role: "member" },
			{ circleMemberId: "502", userId: "uA", role: "admin" },
		]);
		mockTrainerFindMany.mockResolvedValue([{ userId: "uT" }]);
		const res = await call(getMemberFeed, { organizationId: "org1" }, ctx);
		const byId = Object.fromEntries(res.items.map((i) => [i.id, i]));
		expect(byId["2"]).toMatchObject({ isAnnouncement: true, authorRole: "staff" });
		expect(byId["1"]).toMatchObject({ isAnnouncement: false, authorRole: "trainer" });
		expect(res.featured).toBeNull();
		// batched: one lookup each regardless of post count
		expect(mockMemberFindMany).toHaveBeenCalledTimes(1);
		expect(mockTrainerFindMany).toHaveBeenCalledTimes(1);
		expect(mockAttrFindMany).toHaveBeenCalledTimes(1);
	});

	it("presents attributed posts as the trainer", async () => {
		mockAttrFindMany.mockResolvedValue([
			{ circlePostId: "2", trainer: { name: "Ger Byrne", meta: null, user: { image: "https://x/ger.png" } } },
		]);
		const res = await call(getMemberFeed, { organizationId: "org1" }, ctx);
		const post = res.items.find((i) => i.id === "2");
		expect(post).toMatchObject({
			authorName: "Ger Byrne",
			authorAvatarUrl: "https://x/ger.png",
			authorRole: "trainer",
		});
	});

	it("returns the featured Q&A card from the helper", async () => {
		const featured = {
			kind: "qa",
			eventId: "77",
			title: "Ask the trainer",
			startsAt: "2026-10-09T19:00:00Z",
			cta: "Submit questions now",
		};
		mockGetFeatured.mockResolvedValue(featured);
		const res = await call(getMemberFeed, { organizationId: "org1" }, ctx);
		expect(res.featured).toEqual(featured);
	});

	it("only computes the featured card on page 1", async () => {
		mockGetFeatured.mockResolvedValue({ kind: "qa", eventId: "77" });
		mockGetFeatured.mockClear();
		const res = await call(getMemberFeed, { organizationId: "org1", page: 2 }, ctx);
		expect(mockGetFeatured).not.toHaveBeenCalled();
		expect(res.featured).toBeNull();
	});

	it("serves roles even if the identity lookups fail", async () => {
		mockMemberFindMany.mockRejectedValue(new Error("db"));
		const res = await call(getMemberFeed, { organizationId: "org1" }, ctx);
		expect(res.ok).toBe(true);
		expect(res.items).toHaveLength(2);
	});
});
