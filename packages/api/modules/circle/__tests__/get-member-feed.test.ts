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

const HOME_OK = {
	records: [
		{
			id: 1,
			name: "Post one",
			body: { html: "<p>a</p>" },
			body_plain_text: "a",
			space: { id: 9, name: "Laska", slug: "laska" },
			author: { name: "Jane" },
			created_at: "2026-07-01T09:00:00Z",
			url: "https://community.rionna.com/c/laska/post-one",
		},
	],
	has_next_page: true,
	page: 1,
	per_page: 15,
};

describe("getMemberFeed", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
	});

	it("maps records to feed items and reports hasNextPage", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => HOME_OK }));
		const res = await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		expect(res.ok).toBe(true);
		expect(res.items).toHaveLength(1);
		expect(res.items[0]).toMatchObject({ id: "1", spaceId: "9", title: "Post one", excerpt: "a" });
		expect(res.hasNextPage).toBe(true);
	});

	it("returns ok:false items:[] when the Circle call fails", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }));
		const res = await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		expect(res).toMatchObject({ ok: false, items: [], hasNextPage: false });
	});

	it("returns ok:true items:[] when the member has no circleMemberId", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		const res = await call(getMemberFeed, { organizationId: ORG_ID, page: 1, perPage: 15 }, ctx);
		expect(res).toMatchObject({ ok: true, items: [] });
	});
});
