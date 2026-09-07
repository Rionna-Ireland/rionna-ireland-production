import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockMemberFindFirst,
	mockHorseFindMany,
	mockGetMemberToken,
	mockFetchMemberSpaces,
	mockGetMemberSpacesCached,
	mockWriteMemberSpacesCache,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockHorseFindMany: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockFetchMemberSpaces: vi.fn(),
	mockGetMemberSpacesCached: vi.fn(),
	mockWriteMemberSpacesCache: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
		horse: { findMany: mockHorseFindMany },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: () => ({ getMemberToken: mockGetMemberToken }),
	getCircleHeadlessApiBaseUrl: () => "https://app.circle.so/api/headless/v1",
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock("../lib/member-spaces", () => ({
	fetchMemberSpaces: mockFetchMemberSpaces,
	getMemberSpacesCached: mockGetMemberSpacesCached,
	writeMemberSpacesCache: mockWriteMemberSpacesCache,
}));

import { listFeedChips } from "../procedures/list-feed-chips";

const USER = { id: "u1", role: "user", name: "Jane" };
const ctx = { context: { headers: new Headers() } };

const METADATA = JSON.stringify({
	circle: { spaceGroupId: "hg" },
});

const SPACES = [
	{
		id: "s1",
		name: "Announcements",
		emoji: "📣",
		canCreatePost: true,
		isMember: true,
		isPrivate: false,
		spaceGroupId: null,
		isPostDisabled: false,
		spaceType: "basic",
	},
	{
		id: "h1",
		name: "Harry",
		emoji: null,
		canCreatePost: true,
		isMember: true,
		isPrivate: false,
		spaceGroupId: "hg",
		isPostDisabled: false,
		spaceType: "basic",
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: USER });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "org-slug", metadata: METADATA });
	mockMemberFindFirst.mockResolvedValue({ circleMemberId: "cm1" });
	mockHorseFindMany.mockResolvedValue([{ circleSpaceId: "h1" }]);
	mockGetMemberSpacesCached.mockReturnValue(undefined);
	mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
	mockFetchMemberSpaces.mockResolvedValue(SPACES);
});

describe("community.listFeedChips", () => {
	it("returns derived chips for a member", async () => {
		const result = await call(listFeedChips, { organizationId: "org1" }, ctx);
		expect(result).toEqual({
			ok: true,
			chips: [
				{ id: "all", kind: "all", label: "All", spaceIds: [] },
				{ id: "horses", kind: "horses", label: "Horses", spaceIds: ["h1"] },
				{ id: "news", kind: "news", label: "News", spaceIds: [] },
				{ id: "charity", kind: "charity", label: "Charity", spaceIds: [] },
				{ id: "polls", kind: "polls", label: "Polls", spaceIds: [] },
				{ id: "space:s1", kind: "space", label: "Announcements", spaceIds: [] },
			],
		});
		expect(mockWriteMemberSpacesCache).toHaveBeenCalledWith("u1", "org1", SPACES);
	});

	it("returns the fixed chips for a non-member without calling Circle", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		expect(await call(listFeedChips, { organizationId: "org1" }, ctx)).toEqual({
			ok: true,
			chips: [
				{ id: "all", kind: "all", label: "All", spaceIds: [] },
				{ id: "news", kind: "news", label: "News", spaceIds: [] },
				{ id: "charity", kind: "charity", label: "Charity", spaceIds: [] },
				{ id: "polls", kind: "polls", label: "Polls", spaceIds: [] },
			],
		});
		expect(mockGetMemberToken).not.toHaveBeenCalled();
	});

	it("returns ok:false and no chips when the member token mint fails", async () => {
		mockGetMemberToken.mockResolvedValue({ ok: false, reason: "circle_error" });
		expect(await call(listFeedChips, { organizationId: "org1" }, ctx)).toEqual({
			ok: false,
			chips: [],
		});
	});

	it("returns ok:false and no chips when fetchMemberSpaces fails", async () => {
		mockFetchMemberSpaces.mockResolvedValue(null);
		expect(await call(listFeedChips, { organizationId: "org1" }, ctx)).toEqual({
			ok: false,
			chips: [],
		});
	});

	it("serves from the cache without minting a token", async () => {
		mockGetMemberSpacesCached.mockReturnValue(SPACES);
		const result = await call(listFeedChips, { organizationId: "org1" }, ctx);
		expect(result.ok).toBe(true);
		expect(mockGetMemberToken).not.toHaveBeenCalled();
		expect(mockFetchMemberSpaces).not.toHaveBeenCalled();
		expect(mockWriteMemberSpacesCache).not.toHaveBeenCalled();
	});
});
