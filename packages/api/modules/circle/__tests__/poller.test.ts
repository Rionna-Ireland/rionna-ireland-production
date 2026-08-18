/**
 * S6-01 / T11: Circle notification poller tests.
 *
 * 16 cases across `runCirclePollTick` + `pollOneMember` covering:
 *   1. no-op when no orgs have poll enabled
 *   2. baseline (first-ever poll) — advance cursor, no pushes
 *   3. steady state — mapped items produce pushes, cursor advances
 *   4. suppressed types (admin_event / event_reminder) don't push
 *   5. empty page — bumps circleLastPolledAt, no cursor change
 *   6. dormant-return (60 days) re-baseline — no pushes
 *   6b. recently-polled returns pushes normally (10 minutes ago)
 *   7. `not_found` drift — logs circle.drift.detected + resets cursor
 *   8. non-retriable failure (auth) — no DB write, errors bumped
 *   9. retriable failure (rate_limited) — no DB write, errors bumped
 *  10. pollShard filters members off their bucket
 *  11. concurrency limit — no more than N in-flight
 *  12. sendPush throw is swallowed per-item
 *  13. horse-space post routes to CIRCLE_HORSE_DISCUSSION
 *  14. PushToken freshness filter — stale-only users skipped
 *  15. org with poll.enabled === false is skipped (early exit)
 *  16. runBounded unit test — respects limit + drains all tasks
 *  17. enabledCategories filter — suppresses out-of-category pushes
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ──────────────────────────────────────────────
// Mocks — vi.mock is hoisted
// ──────────────────────────────────────────────

const {
	mockOrgFindMany,
	mockMemberFindMany,
	mockMemberUpdate,
	mockHorseFindMany,
	mockGetMemberNotifications,
	mockSendPush,
	mockLoggerInfo,
	mockLoggerWarn,
	mockLoggerError,
} = vi.hoisted(() => ({
	mockOrgFindMany: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockMemberUpdate: vi.fn(),
	mockHorseFindMany: vi.fn(),
	mockGetMemberNotifications: vi.fn(),
	mockSendPush: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
	mockLoggerError: vi.fn(),
}));

vi.mock("@repo/database", async () => {
	// Pull pure helpers (no Prisma client init) from the leaf module so
	// `parseOrgMetadata` keeps real behaviour without tripping the
	// "DATABASE_URL is not set" guard when the Prisma singleton boots.
	const { parseOrgMetadata } =
		await vi.importActual<typeof import("@repo/database/types")>("@repo/database/types");
	return {
		parseOrgMetadata,
		db: {
			organization: { findMany: mockOrgFindMany },
			member: {
				findMany: mockMemberFindMany,
				update: mockMemberUpdate,
			},
			horse: { findMany: mockHorseFindMany },
		},
	};
});

vi.mock("@repo/logs", () => ({
	logger: {
		info: mockLoggerInfo,
		warn: mockLoggerWarn,
		error: mockLoggerError,
		log: vi.fn(),
	},
}));

// Stub push service so we observe sendPush invocations without touching Expo.
vi.mock("../../push/service", () => ({
	sendPush: mockSendPush,
}));

// ──────────────────────────────────────────────
// Imports under test
// ──────────────────────────────────────────────

import type { CircleService } from "@repo/payments/lib/circle/types";

import type { PollCoordination } from "../poll-coordination";
import { mapperTriggerToCategory, pollOneMember, runBounded, runCirclePollTick } from "../poller";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const ORG_ID = "org-1";
const ORG_SLUG = "pink-connections";
const NOW = new Date("2026-04-24T10:00:00Z");

function makeCircleService(): CircleService {
	return {
		createMember: vi.fn(),
		deactivateMember: vi.fn(),
		reactivateMember: vi.fn(),
		deleteMember: vi.fn(),
		getMemberToken: vi.fn(),
		getMemberNotifications: mockGetMemberNotifications,
	} as unknown as CircleService;
}

const makeCircleServiceFactory = vi.fn(() => makeCircleService());

function makeOrg(pollEnabled = true, cadenceMinutes = 1) {
	return {
		id: ORG_ID,
		slug: ORG_SLUG,
		metadata: JSON.stringify({
			circle: {
				communityDomain: "pink.circle.so",
				poll: pollEnabled
					? {
							enabled: true,
							cadenceMinutes,
							enabledCategories: [
								"trainer_post",
								"horse_discussion",
								"direct_engagement",
								"dm",
							],
						}
					: { enabled: false, cadenceMinutes: 5, enabledCategories: [] },
			},
		}),
	};
}

function makeOrgWithPollPolicy(
	policy: Partial<{
		safetyMode: "observe" | "enforce";
		requestBudget: number;
		requestTimeoutMs: number;
	}>,
) {
	const org = makeOrg();
	const parsed = JSON.parse(org.metadata);
	Object.assign(parsed.circle.poll, {
		...policy,
		...(policy.requestBudget !== undefined
			? { maxRequestsPerFiveMinutes: policy.requestBudget }
			: {}),
	});
	delete parsed.circle.poll.requestBudget;
	org.metadata = JSON.stringify(parsed);
	return org;
}

type PollCoordinationMock = {
	acquireLease: Mock<PollCoordination["acquireLease"]>;
	releaseLease: Mock<PollCoordination["releaseLease"]>;
	consumeRequestBudget: Mock<PollCoordination["consumeRequestBudget"]>;
	getBackoff: Mock<PollCoordination["getBackoff"]>;
	recordRateLimit: Mock<PollCoordination["recordRateLimit"]>;
};

function makeCoordination(overrides: Partial<PollCoordination> = {}): PollCoordinationMock {
	return {
		acquireLease: vi.fn(async () => ({ acquired: true, ownerToken: "owner-1" })),
		releaseLease: vi.fn(async () => true),
		consumeRequestBudget: vi.fn(async (limit: number, now: Date) => ({
			allowed: true,
			used: 1,
			limit,
			resetAt: new Date(now.getTime() + 5 * 60_000),
		})),
		getBackoff: vi.fn(async () => ({ active: false })),
		recordRateLimit: vi.fn(async () => ({ active: true })),
		...overrides,
	} as PollCoordinationMock;
}

function makeMember(
	overrides: Partial<{
		id: string;
		userId: string;
		circleMemberId: string | null;
		circleLastSeenNotificationId: string | null;
		circleLastPolledAt: Date | null;
	}> = {},
) {
	return {
		id: overrides.id ?? "m1",
		userId: overrides.userId ?? "u1",
		circleMemberId: overrides.circleMemberId ?? "cm-1",
		circleLastSeenNotificationId: overrides.circleLastSeenNotificationId ?? null,
		circleLastPolledAt: overrides.circleLastPolledAt ?? null,
	};
}

function makeNotification(
	partial: Partial<{
		id: string;
		type: "post" | "comment" | "mention" | "reaction" | "dm" | "admin_event";
		spaceId?: string;
	}>,
) {
	return {
		id: partial.id ?? "n1",
		type: partial.type ?? "mention",
		createdAt: "2026-04-24T09:59:00Z",
		actor: { id: "a1", name: "Alice" },
		subject: {
			kind: "post" as const,
			id: "p1",
			...(partial.spaceId ? { spaceId: partial.spaceId } : {}),
			url: "https://c/p/1",
		},
		text: "hello",
	};
}

// ──────────────────────────────────────────────
// Common setup
// ──────────────────────────────────────────────

beforeEach(() => {
	vi.clearAllMocks();
	mockOrgFindMany.mockResolvedValue([]);
	mockMemberFindMany.mockResolvedValue([]);
	mockMemberUpdate.mockResolvedValue({});
	mockHorseFindMany.mockResolvedValue([]);
	mockSendPush.mockResolvedValue(undefined);
	makeCircleServiceFactory.mockImplementation(() => makeCircleService());
});

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe("runCirclePollTick", () => {
	it("case 1: no-ops when no orgs have poll enabled", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg(false)]);

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(metrics.organizationsScanned).toBe(0);
		expect(mockMemberFindMany).not.toHaveBeenCalled();
		expect(makeCircleServiceFactory).not.toHaveBeenCalled();
	});

	it("case 15: skips orgs with poll.enabled === false (early exit)", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg(false), makeOrg(true)]);
		mockMemberFindMany.mockResolvedValue([]);

		await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		// only the enabled org should have triggered a member lookup
		expect(mockMemberFindMany).toHaveBeenCalledTimes(1);
	});

	it("case 2: first-ever poll is baseline — advances cursor, no pushes", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([makeMember()]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: {
				items: [makeNotification({ id: "n1" }), makeNotification({ id: "n2" })],
				nextCursor: "n2",
			},
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockGetMemberNotifications).toHaveBeenCalledWith("cm-1", {
			sinceNotificationId: null,
			limit: 50,
		});
		expect(mockSendPush).not.toHaveBeenCalled();
		expect(metrics.baselined).toBe(1);
		expect(metrics.pushesSent).toBe(0);
		expect(metrics.notificationsFetched).toBe(2);
		expect(metrics.membersDue).toBe(1);
		expect(metrics.cursorWrites).toBe(1);
		expect(metrics.heartbeatWrites).toBe(0);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: {
				circleLastPolledAt: NOW,
				circleLastSeenNotificationId: "n2",
			},
		});
	});

	it("case 3: steady state — fans out pushes and advances cursor", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "n5",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: {
				items: [
					makeNotification({ id: "n6", type: "mention" }),
					makeNotification({ id: "n7", type: "comment" }),
				],
				nextCursor: "n7",
			},
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockSendPush).toHaveBeenCalledTimes(2);
		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({
				triggerType: "CIRCLE_MENTION",
				organizationId: ORG_ID,
				targetUserId: "u1",
				triggerRefId: "n6",
			}),
		);
		expect(metrics.pushesSent).toBe(2);
		expect(metrics.baselined).toBe(0);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: expect.objectContaining({
				circleLastPolledAt: NOW,
				circleLastSeenNotificationId: "n7",
			}),
		});
	});

	it("case 4: suppressed types (admin_event) don't push but still advance", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "n0",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: {
				items: [makeNotification({ id: "n1", type: "admin_event" })],
				nextCursor: "n1",
			},
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockSendPush).not.toHaveBeenCalled();
		expect(metrics.pushesSent).toBe(0);
		expect(metrics.cursorWrites).toBe(1);
		expect(metrics.notificationsFetched).toBe(1);
	});

	it("case 5: empty unchanged page inside 24 hours performs no member write", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "n5",
				circleLastPolledAt: new Date(NOW.getTime() - 23 * 60 * 60 * 1_000),
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: { items: [], nextCursor: null },
		});

		await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockMemberUpdate).not.toHaveBeenCalled();
	});

	it("case 6: dormant-return re-baselines when circleLastPolledAt > 30 days ago", async () => {
		const sixtyDaysAgo = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "oldN",
				circleLastPolledAt: sixtyDaysAgo,
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: {
				items: [makeNotification({ id: "newN", type: "mention" })],
				nextCursor: "newN",
			},
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		// Critically: sinceNotificationId is null (baseline branch)
		expect(mockGetMemberNotifications).toHaveBeenCalledWith("cm-1", {
			sinceNotificationId: null,
			limit: 50,
		});
		expect(mockSendPush).not.toHaveBeenCalled();
		expect(metrics.baselined).toBe(1);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: {
				circleLastPolledAt: NOW,
				circleLastSeenNotificationId: "newN",
			},
		});
	});

	it("case 6b: recently-polled (10 minutes ago) returns pushes normally", async () => {
		const tenMinAgo = new Date(NOW.getTime() - 10 * 60 * 1000);
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "nLast",
				circleLastPolledAt: tenMinAgo,
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: {
				items: [
					makeNotification({ id: "n1", type: "mention" }),
					makeNotification({ id: "n2", type: "dm" }),
				],
				nextCursor: "n2",
			},
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockGetMemberNotifications).toHaveBeenCalledWith("cm-1", {
			sinceNotificationId: "nLast",
			limit: 50,
		});
		expect(metrics.pushesSent).toBe(2);
		expect(metrics.baselined).toBe(0);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: expect.objectContaining({ circleLastPolledAt: NOW }),
		});
	});

	it("case 7: not_found drift logs circle.drift.detected and resets cursor", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "n9",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: false,
			reason: "not_found",
			retriable: false,
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(metrics.driftDetected).toBe(1);
		expect(metrics.errors).toBe(1);
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			"circle.drift.detected",
			expect.objectContaining({
				memberId: "m1",
				organizationId: ORG_ID,
				circleMemberId: "cm-1",
			}),
		);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { circleLastSeenNotificationId: null },
		});
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it("case 8: non-retriable auth failure — no DB write, errors bumped", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "n1",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: false,
			reason: "auth",
			retriable: false,
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(metrics.errors).toBe(1);
		expect(metrics.driftDetected).toBe(0);
		expect(mockMemberUpdate).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it("case 9: retriable rate_limited failure — no DB write, errors bumped", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "n1",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: false,
			reason: "rate_limited",
			retriable: true,
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(metrics.errors).toBe(1);
		expect(mockMemberUpdate).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it("case 10: pollShard filters members off their bucket", async () => {
		// cadenceMinutes=5, NOW.getUTCMinutes() === 0, so only members whose
		// id hashes to bucket 0 should be polled.
		mockOrgFindMany.mockResolvedValue([makeOrg(true, 5)]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({ id: "m1" }),
			makeMember({ id: "m2" }),
			makeMember({ id: "m3" }),
			makeMember({ id: "m4" }),
			makeMember({ id: "m5" }),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: { items: [], nextCursor: null },
		});

		await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		// Exactly 1/5 should poll on average. Assert strictly fewer than
		// the full set — guarantees sharding actually filtered.
		expect(mockGetMemberNotifications.mock.calls.length).toBeLessThan(5);
	});

	it("case 11: concurrency limit caps in-flight polls", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		const members = Array.from({ length: 8 }, (_, i) =>
			makeMember({ id: `m${i}`, userId: `u${i}`, circleMemberId: `cm-${i}` }),
		);
		mockMemberFindMany.mockResolvedValue(members);

		let inFlight = 0;
		let maxInFlight = 0;
		mockGetMemberNotifications.mockImplementation(async () => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((r) => setTimeout(r, 10));
			inFlight -= 1;
			return { ok: true, data: { items: [], nextCursor: null } };
		});

		await runCirclePollTick({
			now: NOW,
			concurrency: 3,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(maxInFlight).toBeLessThanOrEqual(3);
		expect(mockGetMemberNotifications).toHaveBeenCalledTimes(8);
	});

	it("case 12: sendPush throw is swallowed per-item, cursor still advances", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "n0",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: {
				items: [
					makeNotification({ id: "n1", type: "mention" }),
					makeNotification({ id: "n2", type: "comment" }),
				],
				nextCursor: "n2",
			},
		});
		mockSendPush.mockRejectedValueOnce(new Error("Expo 500")).mockResolvedValueOnce(undefined);

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(metrics.pushesSent).toBe(1);
		expect(mockLoggerError).toHaveBeenCalledWith(
			"[CirclePoller] sendPush threw",
			expect.objectContaining({ circleNotificationId: "n1" }),
		);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: expect.objectContaining({
				circleLastPolledAt: NOW,
				circleLastSeenNotificationId: "n2",
			}),
		});
	});

	it("case 13: horse-space post routes to CIRCLE_HORSE_DISCUSSION", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "n0",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);
		mockHorseFindMany.mockResolvedValue([
			{ id: "h-1", name: "Thunderbolt", circleSpaceId: "sp-42" },
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: {
				items: [makeNotification({ id: "n1", type: "post", spaceId: "sp-42" })],
				nextCursor: "n1",
			},
		});

		await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({
				triggerType: "CIRCLE_HORSE_DISCUSSION",
				title: "Alice posted in Thunderbolt's space",
			}),
		);
	});

	it("case 17: enabledCategories filter suppresses pushes but cursor still advances", async () => {
		// Org has only `trainer_post` enabled. A notification that maps to
		// CIRCLE_MENTION (category `direct_engagement`) is fetched and counted
		// in `notificationsFetched`, but sendPush MUST NOT fire — and the
		// cursor must still advance (we processed the item, just didn't push).
		const org = makeOrg();
		const parsed = JSON.parse(org.metadata);
		parsed.circle.poll.enabledCategories = ["trainer_post"];
		org.metadata = JSON.stringify(parsed);

		mockOrgFindMany.mockResolvedValue([org]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "n5",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: {
				items: [makeNotification({ id: "n6", type: "mention" })],
				nextCursor: "n6",
			},
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockSendPush).not.toHaveBeenCalled();
		expect(metrics.pushesSent).toBe(0);
		expect(metrics.notificationsFetched).toBe(1);
		// Cursor still advances — we *saw* the item, the org just opted out.
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: expect.objectContaining({
				circleLastPolledAt: NOW,
				circleLastSeenNotificationId: "n6",
			}),
		});
	});

	it("personalized_only suppresses a reaction push but still advances the cursor", async () => {
		const org = makeOrg();
		const parsed = JSON.parse(org.metadata);
		parsed.circle.poll.deliveryProfile = "personalized_only";
		org.metadata = JSON.stringify(parsed);

		mockOrgFindMany.mockResolvedValue([org]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "n5",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: {
				items: [makeNotification({ id: "n6", type: "reaction" })],
				nextCursor: "n6",
			},
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockSendPush).not.toHaveBeenCalled();
		expect(metrics.pushesSent).toBe(0);
		expect(metrics.pushesSuppressedByPolicy).toBe(1);
		expect(metrics.cursorWrites).toBe(1);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: {
				circleLastPolledAt: NOW,
				circleLastSeenNotificationId: "n6",
			},
		});
	});

	it("case 14: PushToken freshness filter appears in the member query", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([]);

		await runCirclePollTick({
			now: NOW,
			makeCircleService: makeCircleServiceFactory,
		});

		const args = mockMemberFindMany.mock.calls[0][0];
		// The filter uses the correct `lastSeenAt` column name (not lastUsedAt).
		expect(args.where.user.pushTokens.some.lastSeenAt).toBeDefined();
		expect(args.where.user.pushTokens.some.lastSeenAt.gte).toBeInstanceOf(Date);
		// 30-day horizon from NOW.
		const gte: Date = args.where.user.pushTokens.some.lastSeenAt.gte;
		const expected = NOW.getTime() - 30 * 24 * 60 * 60 * 1000;
		expect(Math.abs(gte.getTime() - expected)).toBeLessThan(1000);
	});

	it("enforce mode skips the org when another poller owns its lease", async () => {
		const coordination = makeCoordination({
			acquireLease: vi.fn(async () => ({ acquired: false })),
		});
		mockOrgFindMany.mockResolvedValue([makeOrgWithPollPolicy({ safetyMode: "enforce" })]);

		const metrics = await runCirclePollTick({ now: NOW, coordination });

		expect(coordination.acquireLease).toHaveBeenCalledWith(ORG_ID, NOW);
		expect(mockMemberFindMany).not.toHaveBeenCalled();
		expect(metrics.leaseCollisions).toBe(1);
		expect(metrics.membersPolled).toBe(0);
	});

	it("observe mode records a lease collision but preserves the legacy poll", async () => {
		const coordination = makeCoordination({
			acquireLease: vi.fn(async () => ({ acquired: false })),
		});
		mockOrgFindMany.mockResolvedValue([makeOrgWithPollPolicy({ safetyMode: "observe" })]);
		mockMemberFindMany.mockResolvedValue([makeMember()]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: { items: [], nextCursor: null },
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			coordination,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockGetMemberNotifications).toHaveBeenCalledTimes(1);
		expect(metrics.leaseCollisions).toBe(1);
		expect(metrics.membersPolled).toBe(1);
	});

	it("enforce mode admits only the first two of three members when the budget is two", async () => {
		let used = 0;
		const coordination = makeCoordination({
			consumeRequestBudget: vi.fn(async (limit: number, now: Date) => {
				used += 1;
				return {
					allowed: used <= limit,
					used,
					limit,
					resetAt: new Date(now.getTime() + 5 * 60_000),
				};
			}),
		});
		mockOrgFindMany.mockResolvedValue([
			makeOrgWithPollPolicy({ safetyMode: "enforce", requestBudget: 2 }),
		]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({ id: "m1", circleMemberId: "cm-1" }),
			makeMember({ id: "m2", circleMemberId: "cm-2" }),
			makeMember({ id: "m3", circleMemberId: "cm-3" }),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: { items: [], nextCursor: null },
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			concurrency: 1,
			coordination,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(coordination.consumeRequestBudget).toHaveBeenCalledTimes(3);
		expect(mockGetMemberNotifications).toHaveBeenCalledTimes(2);
		expect(metrics.membersPolled).toBe(2);
		expect(metrics.deferredByBudget).toBe(1);
		expect(metrics.budgetWouldDefer).toBe(1);
		expect(metrics.requestBudgetUsed).toBe(3);
		expect(metrics.errors).toBe(0);
	});

	it("observe mode records exhausted budget but continues polling", async () => {
		let used = 0;
		const coordination = makeCoordination({
			consumeRequestBudget: vi.fn(async (limit: number, now: Date) => {
				used += 1;
				return {
					allowed: used <= limit,
					used,
					limit,
					resetAt: new Date(now.getTime() + 5 * 60_000),
				};
			}),
		});
		mockOrgFindMany.mockResolvedValue([
			makeOrgWithPollPolicy({ safetyMode: "observe", requestBudget: 1 }),
		]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({ id: "m1", circleMemberId: "cm-1" }),
			makeMember({ id: "m2", circleMemberId: "cm-2" }),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: { items: [], nextCursor: null },
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			concurrency: 1,
			coordination,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockGetMemberNotifications).toHaveBeenCalledTimes(2);
		expect(metrics.membersPolled).toBe(2);
		expect(metrics.budgetWouldDefer).toBe(1);
		expect(metrics.deferredByBudget).toBe(0);
	});

	it("uses the operation clock when a long tick crosses into a fresh budget window", async () => {
		let wallClock = new Date("2026-08-18T12:04:59.900Z");
		const clock = vi.fn(() => new Date(wallClock));
		const usedByWindow = new Map<number, number>();
		const coordination = makeCoordination({
			consumeRequestBudget: vi.fn(async (limit: number, at: Date) => {
				const window = Math.floor(at.getTime() / (5 * 60_000));
				const used = (usedByWindow.get(window) ?? 0) + 1;
				usedByWindow.set(window, used);
				return {
					allowed: used <= limit,
					used,
					limit,
					resetAt: new Date((window + 1) * 5 * 60_000),
				};
			}),
		});
		mockOrgFindMany.mockResolvedValue([
			makeOrgWithPollPolicy({ safetyMode: "enforce", requestBudget: 1 }),
		]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({ id: "m1", circleMemberId: "cm-1" }),
			makeMember({ id: "m2", circleMemberId: "cm-2" }),
		]);
		let outboundCalls = 0;
		mockGetMemberNotifications.mockImplementation(async () => {
			outboundCalls += 1;
			if (outboundCalls === 1) {
				wallClock = new Date("2026-08-18T12:05:00.100Z");
			}
			return { ok: true, data: { items: [], nextCursor: null } };
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			clock,
			concurrency: 1,
			coordination,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockGetMemberNotifications).toHaveBeenCalledTimes(2);
		expect(coordination.acquireLease).toHaveBeenCalledWith(
			ORG_ID,
			new Date("2026-08-18T12:04:59.900Z"),
		);
		expect(coordination.consumeRequestBudget).toHaveBeenNthCalledWith(
			1,
			1,
			new Date("2026-08-18T12:04:59.900Z"),
		);
		expect(coordination.consumeRequestBudget).toHaveBeenNthCalledWith(
			2,
			1,
			new Date("2026-08-18T12:05:00.100Z"),
		);
		expect(metrics.deferredByBudget).toBe(0);
	});

	it("enforce mode defers an active shared backoff before consuming budget", async () => {
		const coordination = makeCoordination({
			getBackoff: vi.fn(async () => ({
				active: true,
				retryAt: new Date(NOW.getTime() + 42_000),
				retryAfterMs: 42_000,
			})),
		});
		mockOrgFindMany.mockResolvedValue([makeOrgWithPollPolicy({ safetyMode: "enforce" })]);
		mockMemberFindMany.mockResolvedValue([makeMember()]);

		const metrics = await runCirclePollTick({
			now: NOW,
			coordination,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(coordination.consumeRequestBudget).not.toHaveBeenCalled();
		expect(mockGetMemberNotifications).not.toHaveBeenCalled();
		expect(mockMemberUpdate).not.toHaveBeenCalled();
		expect(metrics.deferredByBackoff).toBe(1);
		expect(metrics.membersPolled).toBe(0);
		expect(metrics.errors).toBe(0);
	});

	it("records a 429 backoff and defers the next member with concurrency one", async () => {
		let backoffActive = false;
		const coordination = makeCoordination({
			getBackoff: vi.fn(async () =>
				backoffActive
					? {
							active: true,
							retryAt: new Date(NOW.getTime() + 42_000),
							retryAfterMs: 42_000,
						}
					: { active: false },
			),
			recordRateLimit: vi.fn(async () => {
				backoffActive = true;
				return {
					active: true,
					retryAt: new Date(NOW.getTime() + 42_000),
					retryAfterMs: 42_000,
				};
			}),
		});
		mockOrgFindMany.mockResolvedValue([makeOrgWithPollPolicy({ safetyMode: "enforce" })]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({ id: "m1", circleMemberId: "cm-1" }),
			makeMember({ id: "m2", circleMemberId: "cm-2" }),
		]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: false,
			reason: "rate_limited",
			retriable: true,
			retryAfterMs: 42_000,
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			concurrency: 1,
			coordination,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockGetMemberNotifications).toHaveBeenCalledTimes(1);
		expect(coordination.recordRateLimit).toHaveBeenCalledWith(42_000, NOW);
		expect(metrics.rateLimited).toBe(1);
		expect(metrics.deferredByBackoff).toBe(1);
		expect(metrics.membersPolled).toBe(1);
		expect(metrics.errors).toBe(1);
	});

	it("records a late 429 from response time instead of tick start", async () => {
		let wallClock = new Date("2026-08-18T12:00:00Z");
		const clock = vi.fn(() => new Date(wallClock));
		const coordination = makeCoordination();
		mockOrgFindMany.mockResolvedValue([makeOrgWithPollPolicy({ safetyMode: "enforce" })]);
		mockMemberFindMany.mockResolvedValue([makeMember()]);
		mockGetMemberNotifications.mockImplementationOnce(async () => {
			wallClock = new Date("2026-08-18T12:04:30Z");
			return {
				ok: false,
				reason: "rate_limited",
				retriable: true,
				retryAfterMs: 30_000,
			};
		});

		await runCirclePollTick({
			now: NOW,
			clock,
			coordination,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(coordination.recordRateLimit).toHaveBeenCalledWith(
			30_000,
			new Date("2026-08-18T12:04:30Z"),
		);
	});

	it("fails open when coordination throws and records the coordination error", async () => {
		const coordination = makeCoordination({
			getBackoff: vi.fn(async () => {
				throw new Error("redis unavailable");
			}),
		});
		mockOrgFindMany.mockResolvedValue([makeOrgWithPollPolicy({ safetyMode: "enforce" })]);
		mockMemberFindMany.mockResolvedValue([makeMember()]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: { items: [], nextCursor: null },
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			coordination,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(mockGetMemberNotifications).toHaveBeenCalledTimes(1);
		expect(metrics.coordinationErrors).toBe(1);
		expect(metrics.membersPolled).toBe(1);
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			"[CirclePoller] coordination failed open",
			expect.objectContaining({ operation: "getBackoff", memberId: "m1" }),
		);
	});

	it("threads the default 8000ms request timeout through the service factory", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([makeMember()]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: { items: [], nextCursor: null },
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			coordination: null,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(makeCircleServiceFactory).toHaveBeenCalledWith(ORG_SLUG, {
			notificationsRequestTimeoutMs: 8_000,
		});
		expect(metrics.safetyModes).toEqual(["observe"]);
		expect(metrics.deliveryProfiles).toEqual(["legacy_all"]);
		expect(metrics.cadenceMinutes).toEqual([1]);
		expect(metrics.requestBudgets).toEqual([700]);
		expect(metrics.tickMs).toBeGreaterThanOrEqual(0);
	});

	it("counts adapter aborts as timed out polls", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([makeMember()]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: false,
			reason: "network",
			retriable: true,
			raw: { name: "AbortError" },
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			coordination: null,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(metrics.timedOut).toBe(1);
		expect(metrics.membersPolled).toBe(1);
		expect(metrics.errors).toBe(1);
	});

	it("releases an acquired lease when organization setup throws", async () => {
		const coordination = makeCoordination();
		mockOrgFindMany.mockResolvedValue([makeOrgWithPollPolicy({ safetyMode: "enforce" })]);
		mockMemberFindMany.mockRejectedValue(new Error("database unavailable"));

		await expect(runCirclePollTick({ now: NOW, coordination })).rejects.toThrow(
			"database unavailable",
		);

		expect(coordination.releaseLease).toHaveBeenCalledWith(ORG_ID, "owner-1");
	});

	it("releases an acquired lease after a successful organization poll", async () => {
		const coordination = makeCoordination();
		mockOrgFindMany.mockResolvedValue([makeOrgWithPollPolicy({ safetyMode: "enforce" })]);
		mockMemberFindMany.mockResolvedValue([makeMember()]);
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: { items: [], nextCursor: null },
		});

		const metrics = await runCirclePollTick({
			now: NOW,
			coordination,
			makeCircleService: makeCircleServiceFactory,
		});

		expect(metrics.leaseAcquired).toBe(1);
		expect(coordination.releaseLease).toHaveBeenCalledWith(ORG_ID, "owner-1");
	});
});

// ──────────────────────────────────────────────
// Unit tests for helpers
// ──────────────────────────────────────────────

describe("runBounded", () => {
	it("case 16: respects limit + drains all tasks", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		const tasks = Array.from({ length: 12 }, () => async () => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((r) => setTimeout(r, 5));
			inFlight -= 1;
		});

		await runBounded(4, tasks);

		expect(maxInFlight).toBeLessThanOrEqual(4);
	});

	it("no-ops on empty task list", async () => {
		await expect(runBounded(4, [])).resolves.toBeUndefined();
	});
});

describe("mapperTriggerToCategory", () => {
	it("collapses mention/reply/reaction to direct_engagement", () => {
		expect(mapperTriggerToCategory("CIRCLE_MENTION")).toBe("direct_engagement");
		expect(mapperTriggerToCategory("CIRCLE_REPLY")).toBe("direct_engagement");
		expect(mapperTriggerToCategory("CIRCLE_REACTION")).toBe("direct_engagement");
	});

	it("maps other triggers 1:1", () => {
		expect(mapperTriggerToCategory("CIRCLE_DM")).toBe("dm");
		expect(mapperTriggerToCategory("CIRCLE_HORSE_DISCUSSION")).toBe("horse_discussion");
		expect(mapperTriggerToCategory("TRAINER_POST")).toBe("trainer_post");
	});
});

// ──────────────────────────────────────────────
// pollOneMember direct test for the successful-poll heartbeat boundary.
// ──────────────────────────────────────────────

describe("pollOneMember circleLastPolledAt heartbeat", () => {
	it("writes only circleLastPolledAt when an unchanged poll reaches 24 hours", async () => {
		mockGetMemberNotifications.mockResolvedValue({
			ok: true,
			data: { items: [], nextCursor: null },
		});

		const outcome = await pollOneMember(
			{
				member: makeMember({
					circleLastSeenNotificationId: "n5",
					circleLastPolledAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1_000),
				}),
				org: {
					id: ORG_ID,
					slug: ORG_SLUG,
					circleService: makeCircleService(),
					communityDomain: "pink.circle.so",
					cadenceMinutes: 1,
					enabledCategories: [
						"trainer_post",
						"horse_discussion",
						"direct_engagement",
						"dm",
					],
					horseBySpace: () => null,
				},
			},
			{ now: NOW, sendPush: mockSendPush },
		);

		expect(outcome.ok).toBe(true);
		expect(outcome.cursorWrites).toBe(0);
		expect(outcome.heartbeatWrites).toBe(1);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { circleLastPolledAt: NOW },
		});
	});
});
