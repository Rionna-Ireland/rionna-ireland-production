/**
 * Circle poller integration tests (S6-01 / T14).
 *
 * Exercises `runCirclePollTick` end-to-end against a *real* circle-mock HTTP
 * server (not a vi.stubGlobal-fetch fake). Complements the unit tests in
 * `poller.test.ts`, which stub the whole `CircleService`: this file wires
 * `MockServerCircleService` straight at circle-mock, so HTTP, auth-token
 * mint, `{ records, has_next_page }` parsing, `normaliseCircleNotification`,
 * and cursor propagation are all exercised on the wire.
 *
 * Strategy
 * --------
 * Database access is still mocked (Prisma); this is a *Circle-side*
 * integration test, not a full-stack test. `sendPush` is also mocked so we
 * can assert call shape without touching Expo.
 *
 * Running
 * -------
 * Requires circle-mock to be running locally. The suite is env-gated on
 * `CIRCLE_MOCK_URL` (defaults to `http://127.0.0.1:5100` when unset and the
 * server is reachable). If the server is not reachable the whole suite is
 * skipped with a console note — no flaky failures in CI.
 *
 *     # Terminal 1
 *     cd /path/to/circle-mock && pnpm dev
 *
 *     # Terminal 2
 *     cd rionna-ireland && pnpm --filter @repo/api test -- poller.integration
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const DEFAULT_BASE_URL = "http://127.0.0.1:5100";
const BASE_URL = process.env.CIRCLE_MOCK_URL ?? DEFAULT_BASE_URL;

// Resolved in beforeAll inside the suite. `describe.runIf` is evaluated
// after module load, but `beforeAll` inside can still call `ctx.skip()`
// dynamically if the server is unreachable at runtime. We avoid top-level
// await (which the api package's TS config rejects).
let mockAvailable = false;

async function checkCircleMockAvailable(): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 750);
		const res = await fetch(`${BASE_URL}/__mock/health`, {
			signal: controller.signal,
		});
		clearTimeout(timer);
		return res.ok;
	} catch {
		return false;
	}
}

// ──────────────────────────────────────────────
// DB + push mocks (mirrors the shape used in poller.test.ts)
// ──────────────────────────────────────────────

const {
	mockOrgFindMany,
	mockMemberFindMany,
	mockMemberUpdate,
	mockHorseFindMany,
	mockSendPush,
	mockLoggerInfo,
	mockLoggerWarn,
	mockLoggerError,
} = vi.hoisted(() => ({
	mockOrgFindMany: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockMemberUpdate: vi.fn(),
	mockHorseFindMany: vi.fn(),
	mockSendPush: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
	mockLoggerError: vi.fn(),
}));

vi.mock("@repo/database", async () => {
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

vi.mock("../../push/service", () => ({
	sendPush: mockSendPush,
}));

// Imports under test — pulled after mocks so the Prisma shim is active.
import { MockServerCircleService } from "@repo/payments/lib/circle";
import type { CircleService } from "@repo/payments/lib/circle/types";

import { runCirclePollTick } from "../poller";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const ORG_ID = "org-int-1";
const ORG_SLUG = "integration-org";
const NOW = new Date("2026-04-24T10:00:00Z");
const CIRCLE_MEMBER_ID = "103"; // seeded circle-mock member
const UNKNOWN_CIRCLE_MEMBER_ID = "999"; // circle-mock returns 404 on token mint

const MOCK_ADMIN_TOKEN = "mock-circle-admin-token";
const MOCK_APP_TOKEN = "mock-circle-app-token";

function makeOrg({
	cadenceMinutes = 1,
	enabled = true,
}: { cadenceMinutes?: number; enabled?: boolean } = {}) {
	return {
		id: ORG_ID,
		slug: ORG_SLUG,
		metadata: JSON.stringify({
			circle: {
				communityDomain: "circle-mock.local",
				poll: {
					enabled,
					cadenceMinutes,
					enabledCategories: [
						"trainer_post",
						"horse_discussion",
						"direct_engagement",
						"dm",
					],
				},
			},
		}),
	};
}

function makeMember(
	overrides: {
		id?: string;
		userId?: string;
		circleMemberId?: string | null;
		circleLastSeenNotificationId?: string | null;
		circleLastPolledAt?: Date | null;
	} = {},
) {
	return {
		id: overrides.id ?? "m-int-1",
		userId: overrides.userId ?? "u-int-1",
		circleMemberId:
			overrides.circleMemberId === undefined ? CIRCLE_MEMBER_ID : overrides.circleMemberId,
		circleLastSeenNotificationId: overrides.circleLastSeenNotificationId ?? null,
		circleLastPolledAt: overrides.circleLastPolledAt ?? null,
	};
}

function makeRealService(): CircleService {
	return new MockServerCircleService({
		baseUrl: BASE_URL,
		adminToken: MOCK_ADMIN_TOKEN,
		appToken: MOCK_APP_TOKEN,
	});
}

// Expected seeded fan-out against member 103 (see circle-mock seeds.ts).
// 1101 post_created         → TRAINER_POST         ✓ push
// 1102 event_reminder        → suppressed (mapper returns null)
// 1103 post_mention          → CIRCLE_MENTION      ✓ push
// 1104 comment_created       → CIRCLE_REPLY        ✓ push
// 1105 comment_mention       → CIRCLE_MENTION      ✓ push
// 1106 reaction_created      → CIRCLE_REACTION     ✓ push
// 1107 dm_received           → CIRCLE_DM           ✓ push
// 1108 member_joined         → admin_event → suppressed
// 1109 content_flagged       → admin_event → suppressed
// Total pushes on a steady-state full sweep: 6.
const EXPECTED_STEADY_STATE_PUSHES = 6;

// ──────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────

describe("Circle poller integration against circle-mock", () => {
	beforeAll(async () => {
		mockAvailable = await checkCircleMockAvailable();
		if (!mockAvailable) {
			// eslint-disable-next-line no-console
			console.warn(
				`[poller.integration] circle-mock not reachable at ${BASE_URL} — skipping. ` +
					`Start it with: cd circle-mock && pnpm dev`,
			);
			return;
		}
		// Reset circle-mock to seeded state once per file so sibling test
		// files (or a prior interactive session) don't bleed in.
		await fetch(`${BASE_URL}/__mock/reset`, { method: "POST" }).catch(() => undefined);
	});

	beforeEach((ctx) => {
		if (!mockAvailable) ctx.skip();
		vi.clearAllMocks();
		mockOrgFindMany.mockResolvedValue([]);
		mockMemberFindMany.mockResolvedValue([]);
		mockMemberUpdate.mockResolvedValue({});
		mockHorseFindMany.mockResolvedValue([]);
		mockSendPush.mockResolvedValue(undefined);
	});

	it("scenario 1 — baseline: fresh member, no pushes, cursor advances to 1109", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([makeMember({ circleLastSeenNotificationId: null })]);

		const factory = vi.fn(() => makeRealService());
		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: factory,
			sendPush: mockSendPush as never,
		});

		expect(factory).toHaveBeenCalledWith(ORG_SLUG);
		expect(metrics.membersPolled).toBe(1);
		expect(metrics.baselined).toBe(1);
		expect(metrics.pushesSent).toBe(0);
		expect(metrics.notificationsFetched).toBe(9);
		expect(mockSendPush).not.toHaveBeenCalled();
		// Cursor advances to the last seeded id in one baseline sweep.
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m-int-1" },
			data: {
				circleLastPolledAt: NOW,
				circleLastSeenNotificationId: "1109",
			},
		});
	});

	it("scenario 2 — steady state: cursor 1105 → 1109 fires pushes for 1106/1107 only", async () => {
		// Cursor mid-history, recent poll. Circle-mock should return
		// 1106–1109 (4 records); mapper fires pushes for 1106 (reaction)
		// and 1107 (dm). 1108+1109 are admin_event → suppressed.
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "1105",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);

		const factory = vi.fn(() => makeRealService());
		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: factory,
			sendPush: mockSendPush as never,
		});

		expect(metrics.notificationsFetched).toBe(4);
		expect(metrics.pushesSent).toBe(2);
		expect(metrics.baselined).toBe(0);

		// Assert the two pushes we expect (in id order — the poller walks
		// items in the order MockServerCircleService returns them, which
		// is ascending by id).
		const pushCalls = mockSendPush.mock.calls.map((c) => c[0]);
		expect(pushCalls).toHaveLength(2);
		expect(pushCalls[0]).toMatchObject({
			organizationId: ORG_ID,
			targetUserId: "u-int-1",
			triggerType: "CIRCLE_REACTION",
			triggerRefId: "1106",
		});
		expect(pushCalls[1]).toMatchObject({
			organizationId: ORG_ID,
			targetUserId: "u-int-1",
			triggerType: "CIRCLE_DM",
			triggerRefId: "1107",
		});

		// Cursor advances to 1109 (the last id in the page).
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m-int-1" },
			data: expect.objectContaining({
				circleLastPolledAt: NOW,
				circleLastSeenNotificationId: "1109",
			}),
		});
	});

	it("scenario 3 — full steady sweep from cursor 0 fires all 6 mapped pushes", async () => {
		// Cursor 0 + recent poll → steady (not baseline). Exercises every
		// notification_type normalisation path in one go.
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "0",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);

		const factory = vi.fn(() => makeRealService());
		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: factory,
			sendPush: mockSendPush as never,
		});

		expect(metrics.notificationsFetched).toBe(9);
		expect(metrics.pushesSent).toBe(EXPECTED_STEADY_STATE_PUSHES);

		const triggers = mockSendPush.mock.calls.map((c) => c[0].triggerType);
		expect(triggers).toEqual([
			"TRAINER_POST", // 1101
			"CIRCLE_MENTION", // 1103
			"CIRCLE_REPLY", // 1104
			"CIRCLE_MENTION", // 1105
			"CIRCLE_REACTION", // 1106
			"CIRCLE_DM", // 1107
		]);
	});

	it("scenario 4 — not_found drift: unknown circle member id resets cursor + logs", async () => {
		// Circle-mock's auth_token endpoint returns 404 for unseeded
		// community_member_id, which `MockServerCircleService.getMemberToken`
		// classifies as `not_found` → poller drift branch.
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				id: "m-missing",
				userId: "u-missing",
				circleMemberId: UNKNOWN_CIRCLE_MEMBER_ID,
				circleLastSeenNotificationId: "123",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);

		const factory = vi.fn(() => makeRealService());
		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: factory,
			sendPush: mockSendPush as never,
		});

		expect(metrics.driftDetected).toBe(1);
		expect(metrics.errors).toBe(1); // drift counts as a non-ok outcome
		expect(metrics.pushesSent).toBe(0);
		expect(mockSendPush).not.toHaveBeenCalled();

		// Drift path resets cursor (to re-baseline on recovery) and does
		// NOT bump circleLastPolledAt.
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m-missing" },
			data: { circleLastSeenNotificationId: null },
		});
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			"circle.drift.detected",
			expect.objectContaining({
				reason: "not_found",
				memberId: "m-missing",
				circleMemberId: UNKNOWN_CIRCLE_MEMBER_ID,
			}),
		);
	});

	it("scenario 5 — paged fetch: two ticks with per_page=3 walk the history", async () => {
		// We exercise circle-mock's real `after_id + per_page` loop by
		// calling `runCirclePollTick` twice with a limit of 3. The first
		// tick baselines to id 1103 (3 seeded records); the second tick
		// is steady-state and consumes the next page. `limit` is not a
		// PollTickDeps flag, so we override the service to pass per_page=3
		// by wrapping `getMemberNotifications`.
		mockOrgFindMany.mockResolvedValue([makeOrg()]);

		let cursor: string | null = null;
		let polledAt: Date | null = null;
		// beforeEach resets the member shape each tick — we retain state
		// across ticks by reading from a closure and re-injecting it.
		mockMemberFindMany.mockImplementation(async () => [
			makeMember({
				circleLastSeenNotificationId: cursor,
				circleLastPolledAt: polledAt,
			}),
		]);
		mockMemberUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
			if (typeof data.circleLastSeenNotificationId === "string") {
				cursor = data.circleLastSeenNotificationId as string;
			}
			if (data.circleLastPolledAt instanceof Date) {
				polledAt = data.circleLastPolledAt;
			}
			return {};
		});

		// Thin wrapper service that forces per_page=3 on every call.
		const baseSvc = makeRealService();
		const pagedSvc: CircleService = {
			...(baseSvc as unknown as Record<string, unknown>),
			createMember: baseSvc.createMember.bind(baseSvc),
			deactivateMember: baseSvc.deactivateMember.bind(baseSvc),
			reactivateMember: baseSvc.reactivateMember.bind(baseSvc),
			deleteMember: baseSvc.deleteMember.bind(baseSvc),
			getMemberToken: baseSvc.getMemberToken.bind(baseSvc),
			getMemberNotifications: (circleMemberId, opts) =>
				baseSvc.getMemberNotifications(circleMemberId, {
					...opts,
					limit: 3,
				}),
		} as CircleService;
		const factory = vi.fn(() => pagedSvc);

		// Tick 1 — baseline, cursor null → 1103
		const t1 = new Date(NOW.getTime());
		const m1 = await runCirclePollTick({
			now: t1,
			makeCircleService: factory,
			sendPush: mockSendPush as never,
		});
		expect(m1.baselined).toBe(1);
		expect(m1.notificationsFetched).toBe(3);
		expect(cursor).toBe("1103");

		// Tick 2 — steady state, 1103 → 1106 (next 3 records)
		mockSendPush.mockClear();
		mockMemberUpdate.mockClear();
		const t2 = new Date(NOW.getTime() + 60_000);
		const m2 = await runCirclePollTick({
			now: t2,
			makeCircleService: factory,
			sendPush: mockSendPush as never,
		});
		expect(m2.baselined).toBe(0);
		expect(m2.notificationsFetched).toBe(3);
		// 1104 comment_created + 1105 comment_mention + 1106 reaction → 3 pushes
		expect(m2.pushesSent).toBe(3);
		expect(cursor).toBe("1106");
	});

	it("scenario 7 — enabledCategories: only trainer_post pushes fire; mention/reply/reaction/dm suppressed", async () => {
		// Org admin has opted out of everything but trainer_post. Full
		// steady sweep from cursor 0 should still fetch all 9 seeded
		// notifications (metrics reflect that) but only the TRAINER_POST
		// mapping (id 1101) fires a push; every other mapped push —
		// mentions, replies, reactions, dms — is suppressed at the org
		// filter before sendPush is called.
		const org = makeOrg();
		const parsed = JSON.parse(org.metadata);
		parsed.circle.poll.enabledCategories = ["trainer_post"];
		org.metadata = JSON.stringify(parsed);

		mockOrgFindMany.mockResolvedValue([org]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "0",
				circleLastPolledAt: new Date(NOW.getTime() - 60_000),
			}),
		]);

		const factory = vi.fn(() => makeRealService());
		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: factory,
			sendPush: mockSendPush as never,
		});

		expect(metrics.notificationsFetched).toBe(9);
		expect(metrics.pushesSent).toBe(1);

		const triggers = mockSendPush.mock.calls.map((c) => c[0].triggerType);
		expect(triggers).toEqual(["TRAINER_POST"]);

		// Cursor still advances to the tail of the sweep.
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m-int-1" },
			data: expect.objectContaining({
				circleLastPolledAt: NOW,
				circleLastSeenNotificationId: "1109",
			}),
		});
	});

	it("scenario 6 — empty page: recent heartbeat coalesces the member write", async () => {
		mockOrgFindMany.mockResolvedValue([makeOrg()]);
		mockMemberFindMany.mockResolvedValue([
			makeMember({
				circleLastSeenNotificationId: "1109",
				circleLastPolledAt: new Date(NOW.getTime() - 23 * 60 * 60 * 1_000),
			}),
		]);

		const factory = vi.fn(() => makeRealService());
		const metrics = await runCirclePollTick({
			now: NOW,
			makeCircleService: factory,
			sendPush: mockSendPush as never,
		});

		expect(metrics.notificationsFetched).toBe(0);
		expect(metrics.pushesSent).toBe(0);
		expect(metrics.baselined).toBe(0);
		expect(mockSendPush).not.toHaveBeenCalled();

		expect(mockMemberUpdate).not.toHaveBeenCalled();
	});
});
