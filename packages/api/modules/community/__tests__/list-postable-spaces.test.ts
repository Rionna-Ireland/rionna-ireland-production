import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockMemberFindFirst,
	mockGetMemberToken,
	mockFetchMemberSpaces,
	mockGetMemberSpacesCached,
	mockWriteMemberSpacesCache,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
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

import { listPostableSpaces } from "../procedures/list-postable-spaces";

const USER = { id: "u1", role: "user", name: "Jane" };
const ctx = { context: { headers: new Headers() } };

const METADATA = JSON.stringify({
	circle: {
		spaceGroupId: "9",
		spaces: {
			"1": { memberPosting: true },
			"3": { memberPosting: true },
		},
	},
});

const SPACES = [
	{
		id: "1",
		name: "Inside Track",
		emoji: "🏇",
		canCreatePost: true,
		isMember: true,
		spaceGroupId: "9",
		isPostDisabled: false,
		spaceType: "basic",
	},
	{
		// canCreatePost false — excluded
		id: "2",
		name: "Read Only",
		emoji: null,
		canCreatePost: false,
		isMember: true,
		spaceGroupId: null,
		isPostDisabled: false,
		spaceType: "basic",
	},
	{
		// memberPosting not set for this space id — excluded
		id: "4",
		name: "No Posting Allowed",
		emoji: null,
		canCreatePost: true,
		isMember: true,
		spaceGroupId: null,
		isPostDisabled: false,
		spaceType: "basic",
	},
	{
		// isPostDisabled true — excluded even though memberPosting is on
		id: "3",
		name: "Announcements",
		emoji: "📣",
		canCreatePost: true,
		isMember: true,
		spaceGroupId: null,
		isPostDisabled: true,
		spaceType: "basic",
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: USER });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "org-slug", metadata: METADATA });
	mockMemberFindFirst.mockResolvedValue({ circleMemberId: "cm1" });
	mockGetMemberSpacesCached.mockReturnValue(undefined);
	mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
	mockFetchMemberSpaces.mockResolvedValue(SPACES);
});

describe("community.listPostableSpaces", () => {
	it("returns only spaces with canCreatePost && !isPostDisabled && memberPosting===true", async () => {
		const result = await call(listPostableSpaces, { organizationId: "org1" }, ctx);
		expect(result).toEqual({
			ok: true,
			spaces: [{ id: "1", name: "Inside Track", emoji: "🏇", isHorse: true }],
		});
		expect(mockWriteMemberSpacesCache).toHaveBeenCalledWith("u1", "org1", SPACES);
	});

	it("returns empty for a non-member", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		expect(await call(listPostableSpaces, { organizationId: "org1" }, ctx)).toEqual({
			ok: true,
			spaces: [],
		});
		expect(mockGetMemberToken).not.toHaveBeenCalled();
	});

	it("returns empty and skips Circle when features.communityPosting is false", async () => {
		mockOrgFindUnique.mockResolvedValue({
			id: "org1",
			slug: "org-slug",
			metadata: JSON.stringify({ features: { communityPosting: false } }),
		});
		expect(await call(listPostableSpaces, { organizationId: "org1" }, ctx)).toEqual({
			ok: true,
			spaces: [],
		});
		expect(mockMemberFindFirst).not.toHaveBeenCalled();
		expect(mockGetMemberToken).not.toHaveBeenCalled();
	});

	it("returns ok:false when the member token mint fails", async () => {
		mockGetMemberToken.mockResolvedValue({ ok: false, reason: "circle_error" });
		expect(await call(listPostableSpaces, { organizationId: "org1" }, ctx)).toEqual({
			ok: false,
			spaces: [],
		});
		expect(mockFetchMemberSpaces).not.toHaveBeenCalled();
	});

	it("returns ok:false when fetchMemberSpaces fails", async () => {
		mockFetchMemberSpaces.mockResolvedValue(null);
		expect(await call(listPostableSpaces, { organizationId: "org1" }, ctx)).toEqual({
			ok: false,
			spaces: [],
		});
	});

	it("serves from the cache without minting a token", async () => {
		mockGetMemberSpacesCached.mockReturnValue(SPACES);
		const result = await call(listPostableSpaces, { organizationId: "org1" }, ctx);
		expect(result.ok).toBe(true);
		expect(mockGetMemberToken).not.toHaveBeenCalled();
		expect(mockFetchMemberSpaces).not.toHaveBeenCalled();
		expect(mockWriteMemberSpacesCache).not.toHaveBeenCalled();
	});
});
