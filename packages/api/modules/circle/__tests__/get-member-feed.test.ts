import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockMemberFindFirst, mockGetMemberToken } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockGetMemberToken: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: mockGetSession } },
}));

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
	9: { records: [{ id: 1, name: "Older", body: { html: "<p>a</p>" }, body_plain_text: "a", created_at: "2026-07-01T08:00:00Z" }] },
	10: { records: [{ id: 2, name: "Newer", body: { html: "<p>b</p>" }, body_plain_text: "b", created_at: "2026-07-01T09:00:00Z" }] },
};

function routeFetch(
	spacesResp: { ok: boolean; status: number; records?: unknown[] } = { ok: true, status: 200, records: SPACES },
) {
	return vi.fn(async (url) => {
		const u = String(url);
		if (u.includes("/spaces?")) {
			return { ok: spacesResp.ok, status: spacesResp.status, json: async () => ({ records: spacesResp.records ?? [] }) };
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
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
	});

	it("merges posts across the member's post spaces, newest first", async () => {
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		expect(res.ok).toBe(true);
		expect(res.items.map((i) => i.id)).toEqual(["2", "1"]); // 09:00 before 08:00
		expect(res.items[0]).toMatchObject({ id: "2", spaceId: "10", title: "Newer" });
		expect(res.hasNextPage).toBe(false);
	});

	it("injects space context when a post omits it", async () => {
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		expect(res.items.find((i) => i.id === "1")).toMatchObject({ spaceId: "9", spaceName: "Laska" });
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
		const res = await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		expect(res).toMatchObject({ ok: false, items: [], hasNextPage: false });
	});

	it("returns ok:true items:[] when the member has no circleMemberId", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		vi.stubGlobal("fetch", routeFetch());
		const res = await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		expect(res).toMatchObject({ ok: true, items: [] });
	});
});
