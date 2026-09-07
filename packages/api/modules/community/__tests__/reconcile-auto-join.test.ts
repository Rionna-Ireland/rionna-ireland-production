/**
 * S12-02b Task 6: reconcileAutoJoinMemberships tests.
 *
 * Cases:
 *   - joins a member into an autoJoin space when the member-token listing says is_member:false
 *   - skips a member already in the space (is_member:true) without calling addSpaceMember
 *   - continues the sweep after an addSpaceMember failure
 *   - continues the sweep after a getMemberToken failure
 *   - skips orgs with no Circle community configured, and orgs with no autoJoin spaces
 *   - respects the per-run member cap and logs when it's hit
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockOrgFindMany, mockMemberFindMany, mockGetMemberToken, mockAddSpaceMember, mockFetchMemberSpaces, mockLoggerWarn, mockLoggerInfo } =
	vi.hoisted(() => ({
		mockOrgFindMany: vi.fn(),
		mockMemberFindMany: vi.fn(),
		mockGetMemberToken: vi.fn(),
		mockAddSpaceMember: vi.fn(),
		mockFetchMemberSpaces: vi.fn(),
		mockLoggerWarn: vi.fn(),
		mockLoggerInfo: vi.fn(),
	}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findMany: mockOrgFindMany },
		member: { findMany: mockMemberFindMany },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
	// S12-02b review fix: `listAutoJoinSpaceIds` now lives in @repo/database and
	// is imported transitively via ../lib/space-settings — supply a real
	// implementation so the mocked module still behaves correctly.
	listAutoJoinSpaceIds: (metadata: { circle?: { spaces?: Record<string, { autoJoin?: boolean }> } }) => {
		const spaces = metadata.circle?.spaces;
		if (!spaces) return [];
		return Object.entries(spaces)
			.filter(([, settings]) => settings.autoJoin === true)
			.map(([id]) => id);
	},
}));

vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: () => ({
		getMemberToken: mockGetMemberToken,
		addSpaceMember: mockAddSpaceMember,
	}),
}));

vi.mock("../lib/member-spaces", () => ({
	fetchMemberSpaces: mockFetchMemberSpaces,
}));

import { reconcileAutoJoinMemberships } from "../lib/reconcile-auto-join";

const ORG = {
	id: "org1",
	slug: "rionna",
	metadata: JSON.stringify({
		circle: {
			communityDomain: "rionna.circle.so",
			spaces: {
				"1": { autoJoin: true },
				"2": { autoJoin: false },
			},
		},
	}),
};

function makeMember(id: string, circleMemberId: string | null, email = `${id}@test.com`) {
	return { id, circleMemberId, user: { email } };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("reconcileAutoJoinMemberships", () => {
	it("joins a member into an autoJoin space when the member-token listing reports is_member:false", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1")]);
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
		mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: false }]);
		mockAddSpaceMember.mockResolvedValue({ ok: true, data: { spaceId: "1", email: "m1@test.com" } });

		const summary = await reconcileAutoJoinMemberships();

		expect(mockAddSpaceMember).toHaveBeenCalledWith({ spaceId: "1", email: "m1@test.com" });
		expect(summary).toEqual({ orgs: 1, members: 1, joined: 1, skipped: 0, errors: 0 });
	});

	it("skips a member already in the space without calling addSpaceMember", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1")]);
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
		mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: true }]);

		const summary = await reconcileAutoJoinMemberships();

		expect(mockAddSpaceMember).not.toHaveBeenCalled();
		expect(summary).toEqual({ orgs: 1, members: 1, joined: 0, skipped: 1, errors: 0 });
	});

	it("continues the sweep after an addSpaceMember failure", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1"), makeMember("m2", "cm2")]);
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
		mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: false }]);
		mockAddSpaceMember
			.mockResolvedValueOnce({ ok: false, reason: "server_error", retriable: true })
			.mockResolvedValueOnce({ ok: true, data: { spaceId: "1", email: "m2@test.com" } });

		const summary = await reconcileAutoJoinMemberships();

		expect(mockAddSpaceMember).toHaveBeenCalledTimes(2);
		expect(summary).toEqual({ orgs: 1, members: 2, joined: 1, skipped: 0, errors: 1 });
	});

	it("counts a duplicate-membership (invalid_input) addSpaceMember failure as skipped, not errors (review fix)", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1"), makeMember("m2", "cm2")]);
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
		mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: false }]);
		mockAddSpaceMember
			.mockResolvedValueOnce({ ok: false, reason: "invalid_input", retriable: false })
			.mockResolvedValueOnce({ ok: true, data: { spaceId: "1", email: "m2@test.com" } });

		const summary = await reconcileAutoJoinMemberships();

		expect(summary).toEqual({ orgs: 1, members: 2, joined: 1, skipped: 1, errors: 0 });
		expect(mockLoggerInfo).toHaveBeenCalledWith(
			"community.auto_join.join_skipped_invalid_input",
			expect.objectContaining({
				organizationId: "org1",
				memberId: "m1",
				spaceId: "1",
				reason: "invalid_input",
			}),
		);
	});

	it("treats an addSpaceMember throw the same as a failure and keeps going", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1"), makeMember("m2", "cm2")]);
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
		mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: false }]);
		mockAddSpaceMember
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValueOnce({ ok: true, data: { spaceId: "1", email: "m2@test.com" } });

		const summary = await reconcileAutoJoinMemberships();

		expect(summary).toEqual({ orgs: 1, members: 2, joined: 1, skipped: 0, errors: 1 });
	});

	it("counts a getMemberToken failure as an error for every autoJoin space and continues to the next member", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1"), makeMember("m2", "cm2")]);
		mockGetMemberToken
			.mockResolvedValueOnce({ ok: false, reason: "unauthorized", retriable: false })
			.mockResolvedValueOnce({ ok: true, data: { accessToken: "tok" } });
		mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: false }]);
		mockAddSpaceMember.mockResolvedValue({ ok: true, data: { spaceId: "1", email: "m2@test.com" } });

		const summary = await reconcileAutoJoinMemberships();

		expect(summary).toEqual({ orgs: 1, members: 2, joined: 1, skipped: 0, errors: 1 });
	});

	it("skips a member missing circleMemberId or email without calling Circle", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		mockMemberFindMany.mockResolvedValue([{ id: "m1", circleMemberId: null, user: { email: "m1@test.com" } }]);

		const summary = await reconcileAutoJoinMemberships();

		expect(mockGetMemberToken).not.toHaveBeenCalled();
		expect(summary).toEqual({ orgs: 1, members: 1, joined: 0, skipped: 1, errors: 0 });
	});

	it("skips an org with no Circle community configured", async () => {
		mockOrgFindMany.mockResolvedValue([{ id: "org2", slug: "no-circle", metadata: JSON.stringify({}) }]);

		const summary = await reconcileAutoJoinMemberships();

		expect(mockMemberFindMany).not.toHaveBeenCalled();
		expect(summary).toEqual({ orgs: 0, members: 0, joined: 0, skipped: 0, errors: 0 });
	});

	it("skips an org with a Circle community but no autoJoin spaces", async () => {
		mockOrgFindMany.mockResolvedValue([
			{
				id: "org3",
				slug: "rionna",
				metadata: JSON.stringify({
					circle: { communityDomain: "rionna.circle.so", spaces: { "1": { autoJoin: false } } },
				}),
			},
		]);

		const summary = await reconcileAutoJoinMemberships();

		expect(mockMemberFindMany).not.toHaveBeenCalled();
		expect(summary).toEqual({ orgs: 0, members: 0, joined: 0, skipped: 0, errors: 0 });
	});

	it("caps members processed per run and logs when the cap is hit", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		const members = Array.from({ length: 201 }, (_, i) => makeMember(`m${i}`, `cm${i}`));
		mockMemberFindMany.mockResolvedValue(members);
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
		mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: true }]);

		const summary = await reconcileAutoJoinMemberships();

		expect(summary.members).toBe(200);
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			"community.auto_join.member_cap_hit",
			expect.objectContaining({ totalActiveMembers: 201, cap: 200 }),
		);
	});

	it("queries only active, provisioned members (circleMemberId not null, circleStatus active)", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		mockMemberFindMany.mockResolvedValue([]);

		await reconcileAutoJoinMemberships();

		expect(mockMemberFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					organizationId: "org1",
					circleMemberId: { not: null },
					circleStatus: "active",
				}),
			}),
		);
	});
});
