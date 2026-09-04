import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/payments/lib/circle", () => ({
	getCircleHeadlessApiBaseUrl: () => "https://app.circle.so/api/headless/v1",
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import {
	clearMemberSpacesCacheForTests,
	fetchMemberSpaces,
	getMemberSpacesCached,
	invalidateMemberSpacesCache,
	writeMemberSpacesCache,
} from "../lib/member-spaces";
import type { MemberSpace } from "../lib/types";

const RAW_SPACES = [
	{
		id: 1,
		name: "Inside Track",
		emoji: "🏇",
		is_member: true,
		is_post_disabled: false,
		space_group_id: 9,
		space_type: "basic",
		policies: { can_create_post: true },
	},
	{
		id: 2,
		name: "Announcements",
		emoji: null,
		is_member: true,
		is_post_disabled: true,
		space_group_id: null,
		space_type: "basic",
		policies: { can_create_post: false },
	},
];

describe("fetchMemberSpaces", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("parses the bare-array member /spaces response", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => RAW_SPACES,
		});
		const result = await fetchMemberSpaces({ accessToken: "tok" });
		expect(result).toEqual<MemberSpace[]>([
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
				id: "2",
				name: "Announcements",
				emoji: null,
				canCreatePost: false,
				isMember: true,
				spaceGroupId: null,
				isPostDisabled: true,
				spaceType: "basic",
			},
		]);
		expect(fetch).toHaveBeenCalledWith(
			"https://app.circle.so/api/headless/v1/spaces?per_page=100",
			{ headers: { Authorization: "Bearer tok" } },
		);
	});

	it("returns null on a 401 response", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			status: 401,
			json: async () => ({}),
		});
		expect(await fetchMemberSpaces({ accessToken: "bad" })).toBeNull();
	});

	it("returns null when fetch throws (network error)", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNRESET"));
		expect(await fetchMemberSpaces({ accessToken: "tok" })).toBeNull();
	});
});

describe("member-spaces cache", () => {
	const SPACES: MemberSpace[] = [
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
	];

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-09-04T00:00:00Z"));
		clearMemberSpacesCacheForTests();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("is a miss before any write", () => {
		expect(getMemberSpacesCached("u1", "org1")).toBeUndefined();
	});

	it("returns the written value within the TTL", () => {
		writeMemberSpacesCache("u1", "org1", SPACES);
		expect(getMemberSpacesCached("u1", "org1")).toEqual(SPACES);
	});

	it("expires after 60s", () => {
		writeMemberSpacesCache("u1", "org1", SPACES);
		vi.advanceTimersByTime(60_001);
		expect(getMemberSpacesCached("u1", "org1")).toBeUndefined();
	});

	it("keeps entries distinct per user/org", () => {
		writeMemberSpacesCache("u1", "org1", SPACES);
		expect(getMemberSpacesCached("u2", "org1")).toBeUndefined();
		expect(getMemberSpacesCached("u1", "org2")).toBeUndefined();
	});

	it("invalidateMemberSpacesCache drops just that entry", () => {
		writeMemberSpacesCache("u1", "org1", SPACES);
		writeMemberSpacesCache("u1", "org2", SPACES);
		invalidateMemberSpacesCache("u1", "org1");
		expect(getMemberSpacesCached("u1", "org1")).toBeUndefined();
		expect(getMemberSpacesCached("u1", "org2")).toEqual(SPACES);
	});
});
