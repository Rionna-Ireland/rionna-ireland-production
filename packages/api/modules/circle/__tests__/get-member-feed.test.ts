import { call } from "@orpc/server";
import type { OrganizationMetadata } from "@repo/database/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockMemberFindFirst,
	mockGetMemberToken,
	mockHorseFindMany,
	mockGetFollowedHorseIds,
	mockParseOrgMetadata,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockHorseFindMany: vi.fn(),
	mockGetFollowedHorseIds: vi.fn(),
	mockParseOrgMetadata: vi.fn(
		(): OrganizationMetadata => ({ circle: { communityDomain: "community.rionna.com" } }),
	),
}));

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
		horse: { findMany: mockHorseFindMany },
	},
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("../../racing/horses/lib/horse-follows", () => ({
	getFollowedHorseIds: mockGetFollowedHorseIds,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({ getMemberToken: mockGetMemberToken })),
	getCircleHeadlessApiBaseUrl: vi.fn(() => "https://app.circle.so/api/headless/v1"),
	buildCircleCommunityTargetUrl: vi.fn(() => "https://community.rionna.com/c/x/y"),
}));

import { clearMemberFeedCache, invalidateMemberFeedCache } from "../lib/member-feed-cache";
import { getMemberFeed } from "../procedures/get-member-feed";

const ORG_ID = "org1";
const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: ORG_ID };
const ctx = { context: { headers: new Headers() } };

const SPACES = [
	{ id: 9, name: "Laska", slug: "laska", space_type: "basic" },
	{ id: 10, name: "Announcements", slug: "ann", space_type: "basic" },
	{ id: 99, name: "Chat", slug: "chat", space_type: "chat" }, // excluded
];

// posts per space id (note: these omit `space` to exercise space-context injection)
const POSTS: Record<string, { records: Array<Record<string, unknown>> }> = {
	9: {
		records: [
			{
				id: 1,
				name: "Older",
				body: { html: "<p>a</p>" },
				body_plain_text: "a",
				created_at: "2026-07-01T08:00:00Z",
			},
		],
	},
	10: {
		records: [
			{
				id: 2,
				name: "Newer",
				body: { html: "<p>b</p>" },
				body_plain_text: "b",
				created_at: "2026-07-01T09:00:00Z",
			},
		],
	},
};

function routeFetch(
	spacesResp: { ok: boolean; status: number; records?: unknown[] } = {
		ok: true,
		status: 200,
		records: SPACES,
	},
) {
	return vi.fn(async (url) => {
		const u = String(url);
		if (u.includes("/spaces?")) {
			return {
				ok: spacesResp.ok,
				status: spacesResp.status,
				json: async () => ({ records: spacesResp.records ?? [] }),
			};
		}
		const m = u.match(/\/spaces\/(\d+)\/posts/);
		if (m) {
			return { ok: true, status: 200, json: async () => POSTS[m[1]] ?? { records: [] } };
		}
		return { ok: false, status: 404, json: async () => ({}) };
	});
}

describe("getMemberFeed (spaces aggregation)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearMemberFeedCache();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
		mockHorseFindMany.mockResolvedValue([]);
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
	});

	it("merges posts across the member's post spaces, newest first", async () => {
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res.ok).toBe(true);
		expect(res.items.map((i) => i.id)).toEqual(["2", "1"]); // 09:00 before 08:00
		expect(res.items[0]).toMatchObject({ id: "2", spaceId: "10", title: "Newer" });
		expect(res.hasNextPage).toBe(false);
	});

	it("injects space context when a post omits it", async () => {
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res.items.find((i) => i.id === "1")).toMatchObject({
			spaceId: "9",
			spaceName: "Laska",
		});
	});

	it("paginates over the merged buffer", async () => {
		vi.stubGlobal("fetch", routeFetch());
		const p1 = await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 1 }, ctx);
		expect(p1.items.map((i) => i.id)).toEqual(["2"]);
		expect(p1.hasNextPage).toBe(true);
		const p2 = await call(getMemberFeed, { organizationId: ORG_ID, page: 2, perPage: 1 }, ctx);
		expect(p2.items.map((i) => i.id)).toEqual(["1"]);
		expect(p2.hasNextPage).toBe(false);
	});

	it("returns ok:false when the spaces call fails", async () => {
		vi.stubGlobal("fetch", routeFetch({ ok: false, status: 500 }));
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res).toMatchObject({ ok: false, items: [], hasNextPage: false });
	});

	it("returns ok:true items:[] when the member has no circleMemberId", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res).toMatchObject({ ok: true, items: [] });
	});
});

describe("getMemberFeed (horse follow filter)", () => {
	// Space 9 ("Laska") is a horse space (horse "horse-1"); space 10 ("Announcements") is not a horse space.
	beforeEach(() => {
		vi.clearAllMocks();
		clearMemberFeedCache();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
		mockHorseFindMany.mockResolvedValue([{ id: "horse-1", circleSpaceId: "9" }]);
	});

	it("excludes posts from an unfollowed horse space", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res.ok).toBe(true);
		expect(res.items.map((i) => i.id)).toEqual(["2"]); // space 10 only; space 9 dropped
	});

	it("includes posts from a followed horse space", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set(["horse-1"]));
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res.ok).toBe(true);
		expect(res.items.map((i) => i.id).sort()).toEqual(["1", "2"]);
	});

	it("always includes non-horse spaces regardless of follows", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res.items.some((i) => i.id === "2")).toBe(true); // space 10 (non-horse) always present
	});

	it("falls back to the unfiltered feed when the follow lookup throws", async () => {
		mockGetFollowedHorseIds.mockRejectedValue(new Error("db down"));
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res.ok).toBe(true);
		expect(res.items.map((i) => i.id).sort()).toEqual(["1", "2"]);
	});

	it("coerces numeric Circle space ids against string-stored horse.circleSpaceId", async () => {
		// SPACES has { id: 9, ... } (numeric); horse.circleSpaceId is stored as the string "9".
		mockGetFollowedHorseIds.mockResolvedValue(new Set()); // not followed -> space 9 must be dropped
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res.items.some((i) => i.spaceId === "9")).toBe(false);
	});
});

describe("getMemberFeed (S8-04 §5 kill-switch)", () => {
	// Same fixture as the horse-follow-filter suite: space 9 is horse-1's
	// space, space 10 is not a horse space.
	beforeEach(() => {
		vi.clearAllMocks();
		clearMemberFeedCache();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
		mockHorseFindMany.mockResolvedValue([{ id: "horse-1", circleSpaceId: "9" }]);
		mockParseOrgMetadata.mockReturnValue({
			circle: { communityDomain: "community.rionna.com" },
			features: { horseFollows: false },
		});
	});

	it("bypasses the follow filter entirely — every horse space shown, not an empty feed", async () => {
		mockGetFollowedHorseIds.mockResolvedValue(new Set()); // not followed — would normally be dropped
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res.ok).toBe(true);
		expect(res.items.map((i) => i.id).sort()).toEqual(["1", "2"]); // space 9 no longer dropped
		expect(mockGetFollowedHorseIds).not.toHaveBeenCalled();
	});
});

describe("getMemberFeed (buffer cache — FABLE_AUDIT P4/C8)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearMemberFeedCache();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
		mockHorseFindMany.mockResolvedValue([]);
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
	});

	it("serves later pages from the cached buffer without re-fetching Circle", async () => {
		const fetchSpy = routeFetch();
		vi.stubGlobal("fetch", fetchSpy);

		const p1 = await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 1 }, ctx);
		expect(p1.items.map((i) => i.id)).toEqual(["2"]);
		const fetchesAfterP1 = fetchSpy.mock.calls.length;

		const p2 = await call(getMemberFeed, { organizationId: ORG_ID, page: 2, perPage: 1 }, ctx);
		expect(p2.items.map((i) => i.id)).toEqual(["1"]);
		expect(p2.hasNextPage).toBe(false);
		expect(fetchSpy.mock.calls.length).toBe(fetchesAfterP1); // no extra Circle traffic
	});

	it("rebuilds the buffer after the TTL expires", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const fetchSpy = routeFetch();
			vi.stubGlobal("fetch", fetchSpy);

			await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
			const fetchesAfterP1 = fetchSpy.mock.calls.length;

			vi.advanceTimersByTime(61_000);
			await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
			expect(fetchSpy.mock.calls.length).toBeGreaterThan(fetchesAfterP1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not cache a failed build", async () => {
		vi.stubGlobal("fetch", routeFetch({ ok: false, status: 500 }));
		const fail = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(fail.ok).toBe(false);

		vi.stubGlobal("fetch", routeFetch());
		const retry = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(retry.ok).toBe(true);
		expect(retry.items.length).toBe(2);
	});

	it("invalidateMemberFeedCache forces a rebuild for that member", async () => {
		const fetchSpy = routeFetch();
		vi.stubGlobal("fetch", fetchSpy);

		await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		const fetchesAfterP1 = fetchSpy.mock.calls.length;

		invalidateMemberFeedCache(USER.id, ORG_ID);
		await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		expect(fetchSpy.mock.calls.length).toBeGreaterThan(fetchesAfterP1);
	});

	it("caches per member — another user does not hit this user's buffer", async () => {
		const fetchSpy = routeFetch();
		vi.stubGlobal("fetch", fetchSpy);

		await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		const fetchesAfterP1 = fetchSpy.mock.calls.length;

		mockGetSession.mockResolvedValue({
			user: { ...USER, id: "u2" },
			session: SESSION,
		});
		await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		expect(fetchSpy.mock.calls.length).toBeGreaterThan(fetchesAfterP1);
	});
});

describe("getMemberFeed (single-space feed — horse discussion)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearMemberFeedCache();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
		mockHorseFindMany.mockResolvedValue([{ id: "horse-1", circleSpaceId: "9" }]);
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
	});

	it("returns only the requested space's posts", async () => {
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15, spaceId: "9" },
			ctx,
		);
		expect(res.ok).toBe(true);
		expect(res.items.map((i) => i.id)).toEqual(["1"]);
		expect(res.items[0]).toMatchObject({ spaceId: "9" });
	});

	it("shows an unfollowed horse space — explicit navigation bypasses the follow filter", async () => {
		// horse-1 (space 9) is NOT followed, but the member opened its discussion directly.
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15, spaceId: "9" },
			ctx,
		);
		expect(res.items.map((i) => i.id)).toEqual(["1"]);
	});

	it("does not serve a space feed from the merged buffer, nor pollute it", async () => {
		const fetchSpy = routeFetch();
		vi.stubGlobal("fetch", fetchSpy);

		// Prime the merged buffer.
		const merged = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(merged.items.length).toBeGreaterThan(0);
		const fetchesAfterMerged = fetchSpy.mock.calls.length;

		// Space call must hit Circle (not the buffer) and return only space 9.
		const space = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15, spaceId: "9" },
			ctx,
		);
		expect(space.items.map((i) => i.id)).toEqual(["1"]);
		expect(fetchSpy.mock.calls.length).toBeGreaterThan(fetchesAfterMerged);

		// And the merged buffer must still serve the full merged feed afterwards.
		const mergedAgain = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(mergedAgain.items.length).toBe(merged.items.length);
	});

	it("returns ok:false when the space posts fetch fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
		);
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15, spaceId: "9" },
			ctx,
		);
		expect(res).toMatchObject({ ok: false, items: [] });
	});
});

describe("getMemberFeed (total per-space failure — Kimi M1)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearMemberFeedCache();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
		mockHorseFindMany.mockResolvedValue([]);
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
	});

	const failingPostsFetch = () =>
		vi.fn(async (url) => {
			const u = String(url);
			if (u.includes("/spaces?")) {
				return { ok: true, status: 200, json: async () => ({ records: SPACES }) };
			}
			if (/\/spaces\/\d+\/posts/.test(u)) {
				return { ok: false, status: 429, json: async () => ({}) };
			}
			return { ok: false, status: 404, json: async () => ({}) };
		});

	it("returns ok:false (not a cached empty success) when every space fetch fails", async () => {
		vi.stubGlobal("fetch", failingPostsFetch());
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res).toMatchObject({ ok: false, items: [], hasNextPage: false });
	});

	it("does not cache the failure — the next call retries Circle", async () => {
		const fetchSpy = failingPostsFetch();
		vi.stubGlobal("fetch", fetchSpy);
		await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		const afterFirst = fetchSpy.mock.calls.length;
		await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		expect(fetchSpy.mock.calls.length).toBeGreaterThan(afterFirst);
	});

	it("still returns an ok empty feed when spaces genuinely have no posts", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url) => {
				const u = String(url);
				if (u.includes("/spaces?")) {
					return { ok: true, status: 200, json: async () => ({ records: SPACES }) };
				}
				return { ok: true, status: 200, json: async () => ({ records: [] }) };
			}),
		);
		const res = await call(
			getMemberFeed,
			{ organizationId: ORG_ID, page: 1, perPage: 15 },
			ctx,
		);
		expect(res).toMatchObject({ ok: true, items: [] });
	});
});
