import { call } from "@orpc/server";
import type { OrganizationMetadata } from "@repo/database/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockOrgUpdate,
	mockMemberFindFirst,
	mockGetMemberToken,
	mockParseOrgMetadata,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockOrgUpdate: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockParseOrgMetadata: vi.fn(
		(_raw: string | null): OrganizationMetadata => ({
			circle: { communityDomain: "community.rionna.com" },
		}),
	),
}));

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique, update: mockOrgUpdate },
		member: { findFirst: mockMemberFindFirst },
	},
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({ getMemberToken: mockGetMemberToken })),
	getCircleHeadlessApiBaseUrl: vi.fn(() => "https://app.circle.so/api/headless/v1"),
	buildCircleCommunityTargetUrl: vi.fn(() => "https://community.rionna.com/c/x/y"),
}));

import { clearInsideTrackCache } from "../lib/inside-track-cache";
import { getInsideTrack } from "../procedures/get-inside-track";

const ORG_ID = "org1";
const SPACE_ID = "space_it";
const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: ORG_ID };
const ctx = { context: { headers: new Headers() } };

// posts p1..p4, p4 newest
const SPACE_POSTS = {
	records: [
		{
			id: "p4",
			name: "Fourth",
			body: { html: "<p>d</p>" },
			body_plain_text: "d",
			created_at: "2026-07-04T08:00:00Z",
		},
		{
			id: "p3",
			name: "Third",
			body: { html: "<p>c</p>" },
			body_plain_text: "c",
			created_at: "2026-07-03T08:00:00Z",
		},
		{
			id: "p2",
			name: "Second",
			body: { html: "<p>b</p>" },
			body_plain_text: "b",
			created_at: "2026-07-02T08:00:00Z",
		},
		{
			id: "p1",
			name: "First",
			body: { html: "<p>a</p>" },
			body_plain_text: "a",
			created_at: "2026-07-01T08:00:00Z",
		},
	],
};

interface IndividualPostSpec {
	ok: boolean;
	status: number;
	body?: Record<string, unknown>;
}

function routeFetch(
	opts: {
		postsResp?: { ok: boolean; status: number; records?: unknown[] };
		individualPosts?: Record<string, IndividualPostSpec | "throw">;
	} = {},
) {
	const postsResp = opts.postsResp ?? { ok: true, status: 200, records: SPACE_POSTS.records };
	const individualPosts = opts.individualPosts ?? {};

	return vi.fn(async (url) => {
		const u = String(url);
		const listPrefix = `/spaces/${encodeURIComponent(SPACE_ID)}/posts?`;
		if (u.includes(listPrefix)) {
			return {
				ok: postsResp.ok,
				status: postsResp.status,
				json: async () => ({ records: postsResp.records ?? [] }),
			};
		}
		const matchedId = Object.keys(individualPosts).find((id) =>
			u.endsWith(`/spaces/${encodeURIComponent(SPACE_ID)}/posts/${encodeURIComponent(id)}`),
		);
		if (matchedId) {
			const spec = individualPosts[matchedId];
			if (spec === "throw") {
				throw new Error("network down");
			}
			return { ok: spec.ok, status: spec.status, json: async () => spec.body ?? {} };
		}
		// Default: any unmapped individual post fetch reads as a confirmed 404.
		return { ok: false, status: 404, json: async () => ({}) };
	});
}

describe("getInsideTrack", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearInsideTrackCache();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
		mockOrgUpdate.mockResolvedValue({});
		mockParseOrgMetadata.mockReturnValue({
			circle: { communityDomain: "community.rionna.com" },
		});
	});

	it("returns configured:false when no insideTrack space id is set", async () => {
		mockParseOrgMetadata.mockReturnValue({ circle: {} });
		const fetchSpy = routeFetch();
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

		expect(res).toEqual({ ok: true, configured: false, pinned: [], latest: [] });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("partitions pinned (metadata order) from latest (newest first)", async () => {
		mockParseOrgMetadata.mockReturnValue({
			circle: {
				communityDomain: "community.rionna.com",
				insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["p2", "p1"] },
			},
		});
		vi.stubGlobal("fetch", routeFetch());

		const res = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

		expect(res.ok).toBe(true);
		expect(res.configured).toBe(true);
		expect(res.pinned.map((i) => i.id)).toEqual(["p2", "p1"]);
		expect(res.latest.map((i) => i.id)).toEqual(["p4", "p3"]);
		expect(mockOrgUpdate).not.toHaveBeenCalled();
	});

	it("drops confirmed-deleted pinned ids and prunes them from metadata", async () => {
		const orgMetadata: OrganizationMetadata = {
			circle: {
				communityDomain: "community.rionna.com",
				insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["gone", "p1"] },
			},
			brand: { primaryColor: "#123456" },
		};
		mockParseOrgMetadata.mockReturnValue(orgMetadata);
		vi.stubGlobal(
			"fetch",
			routeFetch({
				postsResp: {
					ok: true,
					status: 200,
					records: [
						SPACE_POSTS.records.find((p) => p.id === "p1"),
						SPACE_POSTS.records.find((p) => p.id === "p2"),
					],
				},
				individualPosts: { gone: { ok: false, status: 404 } },
			}),
		);

		const res = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

		expect(res.pinned.map((i) => i.id)).toEqual(["p1"]);
		expect(res.latest.map((i) => i.id)).toEqual(["p2"]);

		// Fire-and-forget prune: flush microtasks so the `.catch` chain settles.
		await new Promise((resolve) => setTimeout(resolve, 0));

		// The prune re-reads fresh metadata (Finding B2): findUnique is called
		// once for the request itself, and again inside the prune.
		expect(mockOrgFindUnique).toHaveBeenCalledTimes(2);
		expect(mockOrgUpdate).toHaveBeenCalledTimes(1);
		const updateArgs = mockOrgUpdate.mock.calls[0][0];
		expect(updateArgs.where).toEqual({ id: ORG_ID });
		const savedMetadata = JSON.parse(updateArgs.data.metadata);
		expect(savedMetadata.circle.insideTrack.pinnedPostIds).toEqual(["p1"]);
		expect(savedMetadata.circle.insideTrack.spaceId).toBe(SPACE_ID);
		// Other metadata must be preserved untouched.
		expect(savedMetadata.brand).toEqual({ primaryColor: "#123456" });
		expect(savedMetadata.circle.communityDomain).toBe("community.rionna.com");
	});

	it("resolves an old pin beyond page 1 via an individual fetch, at its list position", async () => {
		// "old1" is the oldest post in the space — by nature of Start Here pins —
		// and long since fell off the 30-post page.
		mockParseOrgMetadata.mockReturnValue({
			circle: {
				communityDomain: "community.rionna.com",
				insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["old1", "p2"] },
			},
		});
		vi.stubGlobal(
			"fetch",
			routeFetch({
				individualPosts: {
					old1: {
						ok: true,
						status: 200,
						body: {
							id: "old1",
							name: "How this club works",
							body: { html: "<p>welcome</p>" },
							body_plain_text: "welcome",
							created_at: "2025-01-01T08:00:00Z",
						},
					},
				},
			}),
		);

		const res = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

		expect(res.ok).toBe(true);
		expect(res.pinned.map((i) => i.id)).toEqual(["old1", "p2"]);
		expect(res.pinned[0].title).toBe("How this club works");
		// p2 was resolved from the page directly; old1 from spaces/posts/{id}.
		expect(res.latest.map((i) => i.id)).toEqual(["p4", "p3", "p1"]);

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mockOrgUpdate).not.toHaveBeenCalled();
	});

	it("keeps (does not prune) a pin whose individual fetch fails transiently", async () => {
		mockParseOrgMetadata.mockReturnValue({
			circle: {
				communityDomain: "community.rionna.com",
				insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["flaky", "p2"] },
			},
		});
		vi.stubGlobal(
			"fetch",
			routeFetch({
				individualPosts: { flaky: "throw" },
			}),
		);

		const res = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

		// Excluded from this response (we have nothing to show for it)...
		expect(res.pinned.map((i) => i.id)).toEqual(["p2"]);

		// ...but never pruned — a transient failure must never destroy the pin.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mockOrgUpdate).not.toHaveBeenCalled();
	});

	it("also treats a non-404 error on the individual fetch as transient (not pruned)", async () => {
		mockParseOrgMetadata.mockReturnValue({
			circle: {
				communityDomain: "community.rionna.com",
				insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["rate_limited", "p2"] },
			},
		});
		vi.stubGlobal(
			"fetch",
			routeFetch({
				individualPosts: { rate_limited: { ok: false, status: 429 } },
			}),
		);

		const res = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

		expect(res.pinned.map((i) => i.id)).toEqual(["p2"]);

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mockOrgUpdate).not.toHaveBeenCalled();
	});

	it("prune preserves a metadata change an admin made after the request snapshot", async () => {
		const requestTimeMetadata: OrganizationMetadata = {
			circle: {
				communityDomain: "community.rionna.com",
				insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["gone", "p1"] },
			},
		};
		// The admin pins a new post ("p9") via setInsideTrackPins WHILE this
		// request is in flight — the fresh re-read at prune time must see it.
		const concurrentlyEditedMetadata: OrganizationMetadata = {
			circle: {
				communityDomain: "community.rionna.com",
				insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["gone", "p1", "p9"] },
			},
		};

		mockOrgFindUnique
			.mockResolvedValueOnce({ id: ORG_ID, slug: "rionna", metadata: "request-time" })
			.mockResolvedValueOnce({ id: ORG_ID, slug: "rionna", metadata: "fresh" });
		mockParseOrgMetadata.mockImplementation((raw: string | null) =>
			raw === "fresh" ? concurrentlyEditedMetadata : requestTimeMetadata,
		);
		vi.stubGlobal(
			"fetch",
			routeFetch({
				postsResp: {
					ok: true,
					status: 200,
					records: [SPACE_POSTS.records.find((p) => p.id === "p1")],
				},
				individualPosts: { gone: { ok: false, status: 404 } },
			}),
		);

		await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockOrgUpdate).toHaveBeenCalledTimes(1);
		const savedMetadata = JSON.parse(mockOrgUpdate.mock.calls[0][0].data.metadata);
		// "gone" removed, but "p9" (added after the request snapshot) survives.
		expect(savedMetadata.circle.insideTrack.pinnedPostIds).toEqual(["p1", "p9"]);
	});

	it("fails soft on Circle errors", async () => {
		mockParseOrgMetadata.mockReturnValue({
			circle: {
				communityDomain: "community.rionna.com",
				insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["gone", "p1"] },
			},
		});
		vi.stubGlobal("fetch", routeFetch({ postsResp: { ok: false, status: 500 } }));

		const res = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

		expect(res).toEqual({ ok: false, configured: true, pinned: [], latest: [] });

		// Flush microtasks — the prune must NOT run on the failure path.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mockOrgUpdate).not.toHaveBeenCalled();
	});

	it("returns NOT_FOUND when the organization does not exist", async () => {
		mockOrgFindUnique.mockResolvedValue(null);
		await expect(call(getInsideTrack, { organizationId: ORG_ID }, ctx)).rejects.toThrow();
	});

	it("returns configured:true with empty lists when the member has no circleMemberId", async () => {
		mockParseOrgMetadata.mockReturnValue({
			circle: {
				communityDomain: "community.rionna.com",
				insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["p1"] },
			},
		});
		mockMemberFindFirst.mockResolvedValue(null);
		const fetchSpy = routeFetch();
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

		expect(res).toEqual({ ok: true, configured: true, pinned: [], latest: [] });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	describe("60s per-org cache (Finding B3)", () => {
		it("serves the second call from cache, but still runs the org lookup and member gate", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: {
					communityDomain: "community.rionna.com",
					insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["p2", "p1"] },
				},
			});
			const fetchSpy = routeFetch();
			vi.stubGlobal("fetch", fetchSpy);

			const first = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			mockOrgFindUnique.mockClear();
			mockMemberFindFirst.mockClear();

			const second = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

			expect(second).toEqual(first);
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			// The cache is per-org, so a hit must NOT skip the org lookup or the
			// membership gate — only the Circle network calls (token mint + posts
			// fetch) are saved. Skipping these on a cache hit would let an unpaid
			// user ride a warm cache straight to members-only content (D36).
			expect(mockOrgFindUnique).toHaveBeenCalledTimes(1);
			expect(mockMemberFindFirst).toHaveBeenCalledTimes(1);
		});

		it("does not leak cached org content to a user with no member row (paywall bypass regression)", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: {
					communityDomain: "community.rionna.com",
					insideTrack: { spaceId: SPACE_ID, pinnedPostIds: ["p2", "p1"] },
				},
			});
			const fetchSpy = routeFetch();
			vi.stubGlobal("fetch", fetchSpy);

			// Warm the org-level cache as a paying member.
			const first = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);
			expect(first.pinned.length).toBeGreaterThan(0);
			expect(fetchSpy).toHaveBeenCalledTimes(1);

			// A second, unpaid user (no Member row / no circleMemberId) hits the
			// same warm cache and must still get the memberless empty shape — never
			// the cached members-only pinned/latest content.
			mockMemberFindFirst.mockResolvedValue(null);
			const second = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

			expect(second).toEqual({ ok: true, configured: true, pinned: [], latest: [] });
			// No extra Circle calls were needed to reach that verdict — the
			// membership gate short-circuits before the cache is even read.
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});

		it("does not cache a fail-soft (ok:false) response", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: {
					communityDomain: "community.rionna.com",
					insideTrack: { spaceId: SPACE_ID, pinnedPostIds: [] },
				},
			});
			vi.stubGlobal("fetch", routeFetch({ postsResp: { ok: false, status: 500 } }));

			const first = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);
			expect(first.ok).toBe(false);

			const fetchSpy = routeFetch();
			vi.stubGlobal("fetch", fetchSpy);
			const second = await call(getInsideTrack, { organizationId: ORG_ID }, ctx);

			expect(second.ok).toBe(true);
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});
	});
});
