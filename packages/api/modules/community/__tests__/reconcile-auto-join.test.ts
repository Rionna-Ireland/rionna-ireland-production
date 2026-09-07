/**
 * S12-02b Task 6 + final review (I1/I2/I3): reconcileAutoJoinMemberships tests.
 *
 * Cases:
 *   - joins a member into an autoJoin space when the member-token listing says is_member:false
 *   - skips a member already in the space (is_member:true) without calling addSpaceMember
 *   - continues the sweep after an addSpaceMember failure
 *   - continues the sweep after a getMemberToken failure
 *   - skips orgs with no Circle community configured, and orgs with no autoJoin spaces
 *   - respects the per-run member cap and logs when it's hit
 *   - I1: excludes autoJoin spaces that are private or horse-backed per the Admin v2 listing
 *   - I2: stops scheduling new work once the time budget is exceeded and reports truncated
 *   - I3: persists a cursor across runs and wraps back to the start when fewer than the cap remain
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockOrgFindMany,
	mockOrgFindUnique,
	mockOrgUpdateMany,
	mockMemberFindMany,
	mockHorseFindMany,
	mockGetMemberToken,
	mockAddSpaceMember,
	mockListSpaces,
	mockFetchMemberSpaces,
	mockLoggerWarn,
	mockLoggerInfo,
} = vi.hoisted(() => ({
	mockOrgFindMany: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockOrgUpdateMany: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockHorseFindMany: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockAddSpaceMember: vi.fn(),
	mockListSpaces: vi.fn(),
	mockFetchMemberSpaces: vi.fn(),
	mockLoggerWarn: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findMany: mockOrgFindMany, findUnique: mockOrgFindUnique, updateMany: mockOrgUpdateMany },
		member: { findMany: mockMemberFindMany },
		horse: { findMany: mockHorseFindMany },
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
	isHorseSpace: (
		metadata: { circle?: { spaceGroupId?: string } },
		space: { spaceGroupId: string | null },
	) => space.spaceGroupId !== null && space.spaceGroupId === metadata.circle?.spaceGroupId,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: () => ({
		getMemberToken: mockGetMemberToken,
		addSpaceMember: mockAddSpaceMember,
		listSpaces: mockListSpaces,
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
	// Sane defaults so tests that don't care about the I1 guard or the
	// cursor persistence still exercise the happy path: space "1" is public
	// and not horse-backed, the org has no horses, and metadata reads/writes
	// round-trip through the same ORG record.
	mockListSpaces.mockResolvedValue({
		ok: true,
		data: [{ id: "1", name: "Networking", isPrivate: false, spaceGroupId: null }],
	});
	mockHorseFindMany.mockResolvedValue([]);
	mockOrgFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
		if (where.id === ORG.id) return ORG;
		return null;
	});
	mockOrgUpdateMany.mockResolvedValue({ count: 1 });
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
		expect(summary).toEqual({ orgs: 1, members: 1, joined: 1, skipped: 0, errors: 0, truncated: false });
	});

	it("skips a member already in the space without calling addSpaceMember", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1")]);
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
		mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: true }]);

		const summary = await reconcileAutoJoinMemberships();

		expect(mockAddSpaceMember).not.toHaveBeenCalled();
		expect(summary).toEqual({ orgs: 1, members: 1, joined: 0, skipped: 1, errors: 0, truncated: false });
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
		expect(summary).toEqual({ orgs: 1, members: 2, joined: 1, skipped: 0, errors: 1, truncated: false });
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

		expect(summary).toEqual({ orgs: 1, members: 2, joined: 1, skipped: 1, errors: 0, truncated: false });
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

		expect(summary).toEqual({ orgs: 1, members: 2, joined: 1, skipped: 0, errors: 1, truncated: false });
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

		expect(summary).toEqual({ orgs: 1, members: 2, joined: 1, skipped: 0, errors: 1, truncated: false });
	});

	it("skips a member missing circleMemberId or email without calling Circle", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		mockMemberFindMany.mockResolvedValue([{ id: "m1", circleMemberId: null, user: { email: "m1@test.com" } }]);

		const summary = await reconcileAutoJoinMemberships();

		expect(mockGetMemberToken).not.toHaveBeenCalled();
		expect(summary).toEqual({ orgs: 1, members: 1, joined: 0, skipped: 1, errors: 0, truncated: false });
	});

	it("skips an org with no Circle community configured", async () => {
		mockOrgFindMany.mockResolvedValue([{ id: "org2", slug: "no-circle", metadata: JSON.stringify({}) }]);

		const summary = await reconcileAutoJoinMemberships();

		expect(mockMemberFindMany).not.toHaveBeenCalled();
		expect(summary).toEqual({ orgs: 0, members: 0, joined: 0, skipped: 0, errors: 0, truncated: false });
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
		expect(summary).toEqual({ orgs: 0, members: 0, joined: 0, skipped: 0, errors: 0, truncated: false });
	});

	it("caps members processed per run and logs when the cap is hit", async () => {
		mockOrgFindMany.mockResolvedValue([ORG]);
		const members = Array.from({ length: 201 }, (_, i) => makeMember(`m${String(i).padStart(3, "0")}`, `cm${i}`));
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

	describe("I1 — private/horse guard", () => {
		it("does not join a private autoJoin space", async () => {
			mockOrgFindMany.mockResolvedValue([ORG]);
			mockListSpaces.mockResolvedValue({
				ok: true,
				data: [{ id: "1", name: "Private space", isPrivate: true, spaceGroupId: null }],
			});
			mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1")]);

			const summary = await reconcileAutoJoinMemberships();

			expect(mockMemberFindMany).not.toHaveBeenCalled();
			expect(summary).toEqual({ orgs: 0, members: 0, joined: 0, skipped: 0, errors: 0, truncated: false });
		});

		it("does not join a horse space matched via Horse.circleSpaceId", async () => {
			mockOrgFindMany.mockResolvedValue([ORG]);
			mockListSpaces.mockResolvedValue({
				ok: true,
				data: [{ id: "1", name: "Harry", isPrivate: false, spaceGroupId: null }],
			});
			mockHorseFindMany.mockResolvedValue([{ circleSpaceId: "1" }]);
			mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1")]);

			const summary = await reconcileAutoJoinMemberships();

			expect(mockMemberFindMany).not.toHaveBeenCalled();
			expect(summary).toEqual({ orgs: 0, members: 0, joined: 0, skipped: 0, errors: 0, truncated: false });
		});

		it("does not join a horse space matched only via the drifted group-id signal", async () => {
			mockOrgFindMany.mockResolvedValue([
				{
					id: "org1",
					slug: "rionna",
					metadata: JSON.stringify({
						circle: {
							communityDomain: "rionna.circle.so",
							spaceGroupId: "horse-group",
							spaces: { "1": { autoJoin: true } },
						},
					}),
				},
			]);
			mockListSpaces.mockResolvedValue({
				ok: true,
				data: [{ id: "1", name: "Drifted horse", isPrivate: false, spaceGroupId: "horse-group" }],
			});
			mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1")]);

			const summary = await reconcileAutoJoinMemberships();

			expect(mockMemberFindMany).not.toHaveBeenCalled();
			expect(summary).toEqual({ orgs: 0, members: 0, joined: 0, skipped: 0, errors: 0, truncated: false });
		});
	});

	describe("I2 — time budget", () => {
		it("stops scheduling new members once the budget is exceeded and reports truncated", async () => {
			mockOrgFindMany.mockResolvedValue([ORG]);
			mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1"), makeMember("m2", "cm2")]);
			mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
			mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: true }]);

			// First now() call is the sweep start; every call after reports past
			// the budget, so nothing should be processed.
			let calls = 0;
			const now = () => (calls++ === 0 ? 0 : 200_000);

			const summary = await reconcileAutoJoinMemberships({ now });

			expect(summary.truncated).toBe(true);
			expect(summary.members).toBe(0);
			expect(mockLoggerWarn).toHaveBeenCalledWith(
				"community.auto_join.truncated",
				expect.objectContaining({ organizationId: "org1" }),
			);
		});

		it("does not report truncated when the sweep finishes within budget", async () => {
			mockOrgFindMany.mockResolvedValue([ORG]);
			mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1")]);
			mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
			mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: true }]);

			const summary = await reconcileAutoJoinMemberships({ now: () => 0 });

			expect(summary.truncated).toBe(false);
		});
	});

	describe("I3 — cursor persistence and wrap-around", () => {
		function makeManyMembers(count: number) {
			return Array.from({ length: count }, (_, i) => makeMember(`m${String(i).padStart(3, "0")}`, `cm${i}`));
		}

		beforeEach(() => {
			mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
			mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: true }]);
		});

		it("persists a cursor after hitting the cap, and the next run continues after it", async () => {
			// Large enough that the second run's post-cursor batch alone fills
			// the cap (200) without needing to wrap yet — isolates "continues
			// after the cursor" from the separate wrap-and-complete behaviour
			// covered by the tests below.
			const members = makeManyMembers(1000);
			mockMemberFindMany.mockResolvedValue(members);

			mockOrgFindMany.mockResolvedValue([ORG]);
			const summary1 = await reconcileAutoJoinMemberships();
			expect(summary1.members).toBe(200);

			expect(mockOrgUpdateMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ id: "org1" }),
					data: expect.objectContaining({
						metadata: expect.stringContaining(`"autoJoinCursor":"m199"`),
					}),
				}),
			);

			// Second run starts from the persisted cursor.
			const orgWithCursor = {
				...ORG,
				metadata: JSON.stringify({
					circle: {
						communityDomain: "rionna.circle.so",
						spaces: { "1": { autoJoin: true } },
						autoJoinCursor: "m199",
					},
				}),
			};
			mockOrgFindMany.mockResolvedValue([orgWithCursor]);
			mockOrgFindUnique.mockResolvedValue(orgWithCursor);
			mockMemberFindMany.mockResolvedValue(members);
			const summary2 = await reconcileAutoJoinMemberships();
			expect(summary2.members).toBe(200);

			// Run 2 has plenty of members left after the cursor (m200-m399), so
			// it fills the cap without wrapping and simply advances the cursor.
			expect(mockOrgUpdateMany).toHaveBeenLastCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ id: "org1" }),
					data: expect.objectContaining({
						metadata: expect.stringContaining(`"autoJoinCursor":"m399"`),
					}),
				}),
			);
		});

		it("clears the cursor once a full pass completes", async () => {
			const members = makeManyMembers(220);
			const orgWithCursor = {
				...ORG,
				metadata: JSON.stringify({
					circle: {
						communityDomain: "rionna.circle.so",
						spaces: { "1": { autoJoin: true } },
						autoJoinCursor: "m199",
					},
				}),
			};
			mockOrgFindMany.mockResolvedValue([orgWithCursor]);
			mockOrgFindUnique.mockResolvedValue(orgWithCursor);
			mockMemberFindMany.mockResolvedValue(members);

			const summary = await reconcileAutoJoinMemberships();
			expect(summary.members).toBe(200);

			// startIdx is m200 (index 200); afterCursor covers m200-m219 (20,
			// reaching the literal end of the 220-member list) — a full pass
			// completes this run, so the cursor is cleared.
			const calls = mockOrgUpdateMany.mock.calls;
			const lastCall = calls[calls.length - 1]?.[0] as { data: { metadata: string } };
			const written = JSON.parse(lastCall.data.metadata) as { circle?: { autoJoinCursor?: string } };
			expect(written.circle?.autoJoinCursor).toBeUndefined();
		});

		it("does not write metadata when the cursor doesn't change (org fits within the cap)", async () => {
			mockOrgFindMany.mockResolvedValue([ORG]);
			mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1")]);

			await reconcileAutoJoinMemberships();

			expect(mockOrgUpdateMany).not.toHaveBeenCalled();
		});
	});

	describe("residual fix — cursor write CAS and truncated-run cursor", () => {
		function makeManyMembers(count: number) {
			return Array.from({ length: count }, (_, i) => makeMember(`m${String(i).padStart(3, "0")}`, `cm${i}`));
		}

		it("retries once on a compare-and-set miss (count: 0) and succeeds with the re-read value", async () => {
			const members = makeManyMembers(1000);
			mockOrgFindMany.mockResolvedValue([ORG]);
			mockMemberFindMany.mockResolvedValue(members);
			mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
			mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: true }]);

			// First cursor-write attempt misses (a concurrent admin toggle landed
			// first); the retry re-reads and succeeds.
			mockOrgUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

			const summary = await reconcileAutoJoinMemberships();

			expect(summary.members).toBe(200);
			expect(mockOrgFindUnique).toHaveBeenCalledTimes(2);
			expect(mockOrgUpdateMany).toHaveBeenCalledTimes(2);
			expect(mockLoggerWarn).not.toHaveBeenCalledWith(
				"community.auto_join.cursor_write_failed",
				expect.anything(),
			);
		});

		it("gives up after three straight compare-and-set misses and logs a warning instead of throwing", async () => {
			const members = makeManyMembers(1000);
			mockOrgFindMany.mockResolvedValue([ORG]);
			mockMemberFindMany.mockResolvedValue(members);
			mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
			mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: true }]);
			mockOrgUpdateMany.mockResolvedValue({ count: 0 });

			const summary = await reconcileAutoJoinMemberships();

			expect(summary.members).toBe(200);
			expect(mockOrgUpdateMany).toHaveBeenCalledTimes(3);
			expect(mockLoggerWarn).toHaveBeenCalledWith(
				"community.auto_join.cursor_write_failed",
				expect.objectContaining({ organizationId: "org1" }),
			);
		});

		it("leaves the cursor at the last member actually processed when the run truncates mid-batch", async () => {
			mockOrgFindMany.mockResolvedValue([ORG]);
			const members = [makeMember("m1", "cm1"), makeMember("m2", "cm2"), makeMember("m3", "cm3")];
			mockMemberFindMany.mockResolvedValue(members);
			mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
			mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: true }]);

			// now() is called: (1) sweep start, (2) the per-org budget check, then
			// once per task as `runBounded` starts it in index order — m1's task
			// starts and passes its own check (3rd call), then m2's task starts
			// and trips the budget (4th call), setting `truncated` before m3's
			// task ever begins (it bails on the `if (truncated) return` guard
			// without consuming a `now()` call at all). Only m1 is ever counted.
			let calls = 0;
			const now = () => {
				calls++;
				return calls <= 3 ? 0 : 200_000;
			};

			const summary = await reconcileAutoJoinMemberships({ now });

			expect(summary.truncated).toBe(true);
			expect(mockOrgUpdateMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ id: "org1" }),
					data: expect.objectContaining({
						metadata: expect.stringContaining(`"autoJoinCursor":"m1"`),
					}),
				}),
			);
		});

		it("does not write a cursor at all when the run truncates before processing any member", async () => {
			mockOrgFindMany.mockResolvedValue([ORG]);
			mockMemberFindMany.mockResolvedValue([makeMember("m1", "cm1"), makeMember("m2", "cm2")]);
			mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "tok" } });
			mockFetchMemberSpaces.mockResolvedValue([{ id: "1", isMember: true }]);

			// Budget already exceeded before the very first member is picked up.
			let calls = 0;
			const now = () => (calls++ === 0 ? 0 : 200_000);

			const summary = await reconcileAutoJoinMemberships({ now });

			expect(summary.truncated).toBe(true);
			expect(summary.members).toBe(0);
			expect(mockOrgUpdateMany).not.toHaveBeenCalled();
		});
	});
});
