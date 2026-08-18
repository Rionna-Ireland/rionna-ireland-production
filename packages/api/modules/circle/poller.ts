/**
 * Circle Notification Poller (S6-01 / T11)
 *
 * Per-tick driver for pulling Circle-side notifications and fanning them
 * out through the existing push pipeline.
 *
 * Invoked once per minute by the cron entry in apps/saas. The poller walks
 * every provisioned Member whose org has `metadata.circle.poll.enabled`,
 * applies the {@link pollShard} filter, and calls the org-scoped
 * {@link CircleService.getMemberNotifications} for the current tick's
 * assigned members with bounded concurrency.
 *
 * Per-member logic (see {@link pollOneMember}):
 * - First poll (no cursor): BASELINE — advance cursor, no pushes
 * - Dormant return (>30d since last successful poll): BASELINE — no pushes
 * - Drift (`not_found`): log `circle.drift.detected` + BASELINE-on-recovery
 * - Steady state: map notifications → sendPush, advance cursor
 * - Empty page: no write until the configured heartbeat is due
 *
 * All errors are swallowed at the per-member boundary — a single failing
 * member never blocks the rest of the tick.
 */

import { db, parseOrgMetadata, type CircleNotificationCategory } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import type { CircleServiceFactoryOptions } from "@repo/payments/lib/circle";
import type {
	CircleCallFailure,
	CircleNotification,
	CircleService,
} from "@repo/payments/lib/circle/types";

import { sendPush } from "../push/service";
import { runBounded } from "./lib/run-bounded";
import {
	mapCircleNotification,
	type CircleMapperTrigger,
	type MapCtx,
} from "./notification-mapper";
import { createPollCoordinationFromEnv, type PollCoordination } from "./poll-coordination";
import {
	isPollerTriggerAllowed,
	resolvePollPolicy,
	shouldWritePollHeartbeat,
	type CirclePollDeliveryProfile,
	type CirclePollSafetyMode,
} from "./poll-policy";
import { pollShard } from "./poll-shard";

const DORMANT_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_CADENCE_MINUTES = 5;
const DEFAULT_CONCURRENCY = 4;
const FRESH_TOKEN_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Fallback enabled-category set when an org's metadata omits the field.
 * Mirrors the seed default in `packages/database/prisma/seed.ts` — every
 * push-capable category is on until an admin opts out. Categories that
 * `mapperTriggerToCategory` never produces (`event_reminder`, `admin_event`)
 * are intentionally excluded: those triggers are suppressed at the mapper.
 */
export const DEFAULT_ENABLED_CATEGORIES: CircleNotificationCategory[] = [
	"trainer_post",
	"horse_discussion",
	"direct_engagement",
	"dm",
];

export interface PollTickMetrics {
	tickMs: number;
	organizationsScanned: number;
	membersEligible: number;
	membersDue: number;
	membersPolled: number;
	notificationsFetched: number;
	pushesSent: number;
	pushesSuppressedByPolicy: number;
	baselined: number;
	driftDetected: number;
	/** Member updates caused by cursor initialization, advance, or reset. */
	cursorWrites: number;
	/** Heartbeat-only member updates; cursor writes coalesce `circleLastPolledAt`. */
	heartbeatWrites: number;
	leaseAcquired: number;
	leaseCollisions: number;
	coordinationErrors: number;
	requestBudgetUsed: number;
	budgetWouldDefer: number;
	deferredByBudget: number;
	deferredByBackoff: number;
	rateLimited: number;
	timedOut: number;
	safetyModes: CirclePollSafetyMode[];
	deliveryProfiles: CirclePollDeliveryProfile[];
	cadenceMinutes: number[];
	requestBudgets: number[];
	errors: number;
}

export interface PollTickDeps {
	now?: Date;
	/** Wall-clock seam for coordination timestamps; defaults to a fresh Date per operation. */
	clock?: () => Date;
	concurrency?: number;
	/** Factory override — tests inject a fake CircleService. */
	makeCircleService?: (orgSlug: string, options?: CircleServiceFactoryOptions) => CircleService;
	/** sendPush override — tests avoid hitting Expo. */
	sendPush?: typeof sendPush;
	/** Explicit null disables coordination; undefined resolves the production adapter. */
	coordination?: PollCoordination | null;
}

interface OrgPollConfig {
	id: string;
	slug: string;
	circleService: CircleService;
	communityDomain: string | undefined;
	trainerUpdatesSpaceId?: string;
	cadenceMinutes: number;
	enabledCategories: CircleNotificationCategory[];
	deliveryProfile?: CirclePollDeliveryProfile;
	heartbeatHours?: number;
	horseBySpace: (spaceId: string) => { id: string; name: string } | null;
}

interface PollableMember {
	id: string;
	userId: string;
	circleMemberId: string | null;
	circleLastSeenNotificationId: string | null;
	circleLastPolledAt: Date | null;
}

interface MemberPollInput {
	member: PollableMember;
	org: OrgPollConfig;
}

/**
 * Map from the narrow mapper trigger type to the CircleNotificationCategory
 * used by `metadata.circle.poll.enabledCategories`.
 *
 * Kept as a pure helper so the poller and any future UI toggle live on the
 * same enum. Not every push category has a 1:1 category — the two
 * direct-engagement ones (mention + reaction) collapse to a single filter.
 */
export function mapperTriggerToCategory(
	trigger: CircleMapperTrigger,
): "trainer_post" | "horse_discussion" | "direct_engagement" | "dm" {
	switch (trigger) {
		case "CIRCLE_MENTION":
		case "CIRCLE_REPLY":
		case "CIRCLE_REACTION":
			return "direct_engagement";
		case "CIRCLE_DM":
			return "dm";
		case "CIRCLE_HORSE_DISCUSSION":
			return "horse_discussion";
		case "TRAINER_POST":
			return "trainer_post";
	}
}

// ──────────────────────────────────────────────
// Bounded-concurrency runner (lives in lib/run-bounded so light callers —
// e.g. horse-follows — don't have to import the whole poller)
// ──────────────────────────────────────────────

export { runBounded };

// ──────────────────────────────────────────────
// pollOneMember
// ──────────────────────────────────────────────

export interface PollOutcome {
	ok: boolean;
	notificationsFetched: number;
	pushesSent: number;
	pushesSuppressedByPolicy: number;
	baselined: boolean;
	driftDetected: boolean;
	/** Update reason count, not the number of individual fields written. */
	cursorWrites: number;
	/** Heartbeat-only update reason; zero when coalesced into a cursor update. */
	heartbeatWrites: number;
	coordinationErrors: number;
	requestBudgetUsed: number;
	budgetWouldDefer: number;
	deferredByBudget: boolean;
	deferredByBackoff: boolean;
	rateLimited: boolean;
	timedOut: boolean;
	/** CircleCallFailure reason when `ok === false`. */
	reason?: CircleCallFailure;
}

interface PollOneMemberDeps {
	now: Date;
	clock?: () => Date;
	sendPush: typeof sendPush;
	coordination?: PollCoordination | null;
	safetyMode?: CirclePollSafetyMode;
	requestBudget?: number;
}

function pollOutcome(overrides: Partial<PollOutcome> = {}): PollOutcome {
	return {
		ok: true,
		notificationsFetched: 0,
		pushesSent: 0,
		pushesSuppressedByPolicy: 0,
		baselined: false,
		driftDetected: false,
		cursorWrites: 0,
		heartbeatWrites: 0,
		coordinationErrors: 0,
		requestBudgetUsed: 0,
		budgetWouldDefer: 0,
		deferredByBudget: false,
		deferredByBackoff: false,
		rateLimited: false,
		timedOut: false,
		...overrides,
	};
}

function coordinationFailedOpen(
	operation: string,
	error: unknown,
	context: { organizationId: string; memberId?: string },
): void {
	logger.warn("[CirclePoller] coordination failed open", {
		surface: "circle.poller",
		operation,
		...context,
		error: error instanceof Error ? error.message : String(error),
	});
}

function isAbortFailure(raw: unknown): boolean {
	return (
		typeof raw === "object" &&
		raw !== null &&
		"name" in raw &&
		(raw as { name?: unknown }).name === "AbortError"
	);
}

export async function pollOneMember(
	input: MemberPollInput,
	deps: PollOneMemberDeps,
): Promise<PollOutcome> {
	const { member, org } = input;
	const { now } = deps;

	if (!member.circleMemberId) {
		// Defensive — the caller query already filters this, but a member
		// can race a deprovision in between.
		return pollOutcome();
	}

	const isFirstPoll = member.circleLastSeenNotificationId === null;
	const isDormantReturn =
		member.circleLastPolledAt !== null &&
		now.getTime() - member.circleLastPolledAt.getTime() > DORMANT_THRESHOLD_MS;
	const isBaselinePoll = isFirstPoll || isDormantReturn;

	let coordinationErrors = 0;
	let requestBudgetUsed = 0;
	let budgetWouldDefer = 0;
	if (deps.coordination) {
		try {
			const backoff = await deps.coordination.getBackoff(deps.clock?.() ?? now);
			if (backoff.active && deps.safetyMode === "enforce") {
				return pollOutcome({ deferredByBackoff: true });
			}
		} catch (error) {
			coordinationErrors += 1;
			coordinationFailedOpen("getBackoff", error, {
				organizationId: org.id,
				memberId: member.id,
			});
		}

		try {
			const budget = await deps.coordination.consumeRequestBudget(
				deps.requestBudget ?? 700,
				deps.clock?.() ?? now,
			);
			requestBudgetUsed = budget.used;
			if (!budget.allowed) {
				budgetWouldDefer = 1;
				if (deps.safetyMode === "enforce") {
					return pollOutcome({
						coordinationErrors,
						requestBudgetUsed,
						budgetWouldDefer,
						deferredByBudget: true,
					});
				}
			}
		} catch (error) {
			coordinationErrors += 1;
			coordinationFailedOpen("consumeRequestBudget", error, {
				organizationId: org.id,
				memberId: member.id,
			});
		}
	}

	const page = await org.circleService.getMemberNotifications(member.circleMemberId, {
		sinceNotificationId: isBaselinePoll ? null : member.circleLastSeenNotificationId,
		limit: 50,
	});

	let rateLimited = false;
	if (!page.ok && page.reason === "rate_limited") {
		rateLimited = true;
		if (deps.coordination) {
			try {
				await deps.coordination.recordRateLimit(page.retryAfterMs, deps.clock?.() ?? now);
			} catch (error) {
				coordinationErrors += 1;
				coordinationFailedOpen("recordRateLimit", error, {
					organizationId: org.id,
					memberId: member.id,
				});
			}
		}
	}

	if (!page.ok) {
		if (page.reason === "not_found") {
			// Drift: Circle no longer knows about this member. Log + reset
			// cursor so that, if the member is re-provisioned later, we
			// baseline cleanly on the next tick.
			logger.warn("circle.drift.detected", {
				surface: "circle.poller",
				memberId: member.id,
				userId: member.userId,
				organizationId: org.id,
				circleMemberId: member.circleMemberId,
				reason: "not_found",
				retriable: false,
			});
			await db.member.update({
				where: { id: member.id },
				data: {
					circleLastSeenNotificationId: null,
					// Intentionally do NOT bump circleLastPolledAt — the poll
					// did not succeed.
				},
			});
			return pollOutcome({
				ok: false,
				driftDetected: true,
				cursorWrites: 1,
				coordinationErrors,
				requestBudgetUsed,
				budgetWouldDefer,
				rateLimited,
				reason: "not_found",
			});
		}

		logger.warn("[CirclePoller] getMemberNotifications failed", {
			surface: "circle.poller",
			memberId: member.id,
			organizationId: org.id,
			reason: page.reason,
			retriable: page.retriable,
		});
		return pollOutcome({
			ok: false,
			coordinationErrors,
			requestBudgetUsed,
			budgetWouldDefer,
			rateLimited,
			timedOut: page.reason === "network" && isAbortFailure(page.raw),
			reason: page.reason,
		});
	}

	const items = page.data.items;
	const nextCursor = page.data.nextCursor;

	// Baseline branch: advance cursor, bump polled-at, no pushes.
	if (isBaselinePoll) {
		await db.member.update({
			where: { id: member.id },
			data: {
				circleLastPolledAt: now,
				...(nextCursor !== member.circleLastSeenNotificationId
					? { circleLastSeenNotificationId: nextCursor }
					: {}),
			},
		});
		return pollOutcome({
			notificationsFetched: items.length,
			baselined: true,
			cursorWrites: nextCursor !== member.circleLastSeenNotificationId ? 1 : 0,
			coordinationErrors,
			requestBudgetUsed,
			budgetWouldDefer,
		});
	}

	// Steady state. `tryFanOut` enforces the org's `enabledCategories`
	// filter per-item before calling `sendPush`.
	let pushesSent = 0;
	let pushesSuppressedByPolicy = 0;

	for (const item of items) {
		const push = await tryFanOut(item, member.userId, org, deps);
		if (push.sent) pushesSent += 1;
		if (push.suppressedByPolicy) pushesSuppressedByPolicy += 1;
	}

	const cursorChanged = nextCursor !== null && nextCursor !== member.circleLastSeenNotificationId;
	const heartbeatDue = shouldWritePollHeartbeat(
		member.circleLastPolledAt,
		now,
		org.heartbeatHours ?? 24,
	);
	if (cursorChanged || heartbeatDue) {
		await db.member.update({
			where: { id: member.id },
			data: {
				circleLastPolledAt: now,
				...(cursorChanged ? { circleLastSeenNotificationId: nextCursor } : {}),
			},
		});
	}

	return pollOutcome({
		notificationsFetched: items.length,
		pushesSent,
		pushesSuppressedByPolicy,
		cursorWrites: cursorChanged ? 1 : 0,
		heartbeatWrites: !cursorChanged && heartbeatDue ? 1 : 0,
		coordinationErrors,
		requestBudgetUsed,
		budgetWouldDefer,
	});
}

async function tryFanOut(
	item: CircleNotification,
	userId: string,
	org: OrgPollConfig,
	deps: PollOneMemberDeps,
): Promise<{ sent: boolean; suppressedByPolicy: boolean }> {
	const ctx: MapCtx = {
		organizationId: org.id,
		communityDomain: org.communityDomain,
		trainerUpdatesSpaceId: org.trainerUpdatesSpaceId,
		horseBySpace: org.horseBySpace,
	};

	const mapped = mapCircleNotification(item, ctx);
	if (!mapped) return { sent: false, suppressedByPolicy: false };
	if (!isPollerTriggerAllowed(org.deliveryProfile ?? "legacy_all", mapped.triggerType)) {
		return { sent: false, suppressedByPolicy: true };
	}

	// Per-org enabled-category filter. User-level push preferences (T10)
	// are enforced separately inside `sendPush`; this is the org-admin
	// opt-out surface.
	const category = mapperTriggerToCategory(mapped.triggerType);
	if (!org.enabledCategories.includes(category)) {
		return { sent: false, suppressedByPolicy: false };
	}

	try {
		await deps.sendPush({
			organizationId: org.id,
			triggerType: mapped.triggerType,
			triggerRefId: item.id,
			title: mapped.title,
			body: mapped.body,
			data: mapped.data,
			targetUserId: userId,
		});
		return { sent: true, suppressedByPolicy: false };
	} catch (error) {
		logger.error("[CirclePoller] sendPush threw", {
			surface: "circle.poller",
			organizationId: org.id,
			userId,
			circleNotificationId: item.id,
			error: error instanceof Error ? error.message : String(error),
		});
		return { sent: false, suppressedByPolicy: false };
	}
}

// ──────────────────────────────────────────────
// runCirclePollTick
// ──────────────────────────────────────────────

export async function runCirclePollTick(deps: PollTickDeps = {}): Promise<PollTickMetrics> {
	const tickStartedAt = Date.now();
	const now = deps.now ?? new Date();
	const coordinationClock = deps.clock ?? (deps.now === undefined ? () => new Date() : () => now);
	const concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;
	const makeCircle = deps.makeCircleService ?? createCircleService;
	const sendPushFn = deps.sendPush ?? sendPush;
	let coordination = deps.coordination ?? null;
	let coordinationResolved = deps.coordination !== undefined;

	const metrics: PollTickMetrics = {
		tickMs: 0,
		organizationsScanned: 0,
		membersEligible: 0,
		membersDue: 0,
		membersPolled: 0,
		notificationsFetched: 0,
		pushesSent: 0,
		pushesSuppressedByPolicy: 0,
		baselined: 0,
		driftDetected: 0,
		cursorWrites: 0,
		heartbeatWrites: 0,
		leaseAcquired: 0,
		leaseCollisions: 0,
		coordinationErrors: 0,
		requestBudgetUsed: 0,
		budgetWouldDefer: 0,
		deferredByBudget: 0,
		deferredByBackoff: 0,
		rateLimited: 0,
		timedOut: 0,
		safetyModes: [],
		deliveryProfiles: [],
		cadenceMinutes: [],
		requestBudgets: [],
		errors: 0,
	};
	const observe = <T>(values: T[], value: T) => {
		if (!values.includes(value)) values.push(value);
	};

	const orgs = await db.organization.findMany({
		select: { id: true, slug: true, metadata: true },
	});

	for (const org of orgs) {
		if (!org.slug) continue;
		const metadata = parseOrgMetadata(org.metadata as string | null);
		const poll = metadata.circle?.poll;

		// Early exit: org has not enabled polling.
		if (!poll?.enabled) continue;

		metrics.organizationsScanned += 1;

		const cadenceMinutes =
			typeof poll.cadenceMinutes === "number" && poll.cadenceMinutes > 0
				? poll.cadenceMinutes
				: DEFAULT_CADENCE_MINUTES;

		const enabledCategories =
			Array.isArray(poll.enabledCategories) && poll.enabledCategories.length > 0
				? poll.enabledCategories
				: DEFAULT_ENABLED_CATEGORIES;
		const policy = resolvePollPolicy(poll);
		observe(metrics.safetyModes, policy.safetyMode);
		observe(metrics.deliveryProfiles, policy.deliveryProfile);
		observe(metrics.cadenceMinutes, cadenceMinutes);
		observe(metrics.requestBudgets, policy.maxRequestsPerFiveMinutes);

		if (!coordinationResolved) {
			coordinationResolved = true;
			try {
				coordination = createPollCoordinationFromEnv();
				if (!coordination) {
					metrics.coordinationErrors += 1;
					coordinationFailedOpen(
						"createPollCoordinationFromEnv",
						new Error("UPSTASH_REDIS_REST_URL or token is not configured"),
						{ organizationId: org.id },
					);
				}
			} catch (error) {
				metrics.coordinationErrors += 1;
				coordinationFailedOpen("createPollCoordinationFromEnv", error, {
					organizationId: org.id,
				});
			}
		}

		let leaseOwnerToken: string | undefined;
		if (coordination) {
			try {
				const lease = await coordination.acquireLease(org.id, coordinationClock());
				if (lease.acquired && lease.ownerToken) {
					leaseOwnerToken = lease.ownerToken;
					metrics.leaseAcquired += 1;
				} else if (lease.acquired) {
					throw new Error("coordination acquired a lease without an owner token");
				} else {
					metrics.leaseCollisions += 1;
					if (policy.safetyMode === "enforce") continue;
				}
			} catch (error) {
				metrics.coordinationErrors += 1;
				coordinationFailedOpen("acquireLease", error, { organizationId: org.id });
			}
		}

		try {
			// Only pull members whose orgs have push-capable users with fresh
			// tokens. The freshness filter trims load: members without any
			// seen-recently PushToken can't receive anything anyway.
			const members = await db.member.findMany({
				where: {
					organizationId: org.id,
					circleMemberId: { not: null },
					circleStatus: "active",
					user: {
						pushEnabled: true,
						pushTokens: {
							some: {
								lastSeenAt: {
									gte: new Date(now.getTime() - FRESH_TOKEN_THRESHOLD_MS),
								},
							},
						},
					},
				},
				select: {
					id: true,
					userId: true,
					circleMemberId: true,
					circleLastSeenNotificationId: true,
					circleLastPolledAt: true,
				},
			});

			metrics.membersEligible += members.length;

			// Apply pollShard to pick just this minute's bucket.
			const eligible = members.filter((m) => pollShard(m.id, now, cadenceMinutes));
			metrics.membersDue += eligible.length;

			if (eligible.length === 0) continue;

			// Preload horse-by-space so each mapped item can resolve without an
			// extra round-trip.
			const horses = await db.horse.findMany({
				where: {
					organizationId: org.id,
					circleSpaceId: { not: null },
				},
				select: { id: true, name: true, circleSpaceId: true },
			});
			const horseBySpaceMap = new Map(
				horses
					.filter(
						(h): h is typeof h & { circleSpaceId: string } =>
							typeof h.circleSpaceId === "string",
					)
					.map((h) => [h.circleSpaceId, { id: h.id, name: h.name }]),
			);

			let circleService: CircleService;
			try {
				circleService = makeCircle(org.slug, {
					notificationsRequestTimeoutMs: policy.requestTimeoutMs,
				});
			} catch (error) {
				logger.error("[CirclePoller] createCircleService failed", {
					surface: "circle.poller",
					organizationId: org.id,
					slug: org.slug,
					error: error instanceof Error ? error.message : String(error),
				});
				metrics.errors += 1;
				continue;
			}

			const orgConfig: OrgPollConfig = {
				id: org.id,
				slug: org.slug,
				circleService,
				communityDomain: metadata.circle?.communityDomain,
				trainerUpdatesSpaceId: metadata.circle?.trainerUpdatesSpaceId,
				cadenceMinutes,
				enabledCategories,
				deliveryProfile: policy.deliveryProfile,
				heartbeatHours: policy.heartbeatHours,
				horseBySpace: (spaceId: string) => horseBySpaceMap.get(spaceId) ?? null,
			};

			const tasks = eligible.map((member) => async () => {
				try {
					const outcome = await pollOneMember(
						{ member, org: orgConfig },
						{
							now,
							clock: coordinationClock,
							sendPush: sendPushFn,
							coordination,
							safetyMode: policy.safetyMode,
							requestBudget: policy.maxRequestsPerFiveMinutes,
						},
					);
					metrics.coordinationErrors += outcome.coordinationErrors;
					metrics.requestBudgetUsed = Math.max(
						metrics.requestBudgetUsed,
						outcome.requestBudgetUsed,
					);
					metrics.budgetWouldDefer += outcome.budgetWouldDefer;
					if (outcome.deferredByBudget) metrics.deferredByBudget += 1;
					if (outcome.deferredByBackoff) metrics.deferredByBackoff += 1;
					if (outcome.deferredByBudget || outcome.deferredByBackoff) return;

					metrics.membersPolled += 1;
					metrics.notificationsFetched += outcome.notificationsFetched;
					metrics.pushesSent += outcome.pushesSent;
					metrics.pushesSuppressedByPolicy += outcome.pushesSuppressedByPolicy;
					metrics.cursorWrites += outcome.cursorWrites;
					metrics.heartbeatWrites += outcome.heartbeatWrites;
					if (outcome.baselined) metrics.baselined += 1;
					if (outcome.driftDetected) metrics.driftDetected += 1;
					if (outcome.rateLimited) metrics.rateLimited += 1;
					if (outcome.timedOut) metrics.timedOut += 1;
					if (!outcome.ok) metrics.errors += 1;
				} catch (error) {
					metrics.errors += 1;
					logger.error("[CirclePoller] pollOneMember threw", {
						surface: "circle.poller",
						memberId: member.id,
						organizationId: org.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			});

			await runBounded(concurrency, tasks);
		} finally {
			if (coordination && leaseOwnerToken) {
				try {
					const released = await coordination.releaseLease(org.id, leaseOwnerToken);
					if (!released) {
						metrics.coordinationErrors += 1;
						coordinationFailedOpen(
							"releaseLease",
							new Error("owned lease was not released"),
							{ organizationId: org.id },
						);
					}
				} catch (error) {
					metrics.coordinationErrors += 1;
					coordinationFailedOpen("releaseLease", error, { organizationId: org.id });
				}
			}
		}
	}

	metrics.tickMs = Date.now() - tickStartedAt;
	return metrics;
}
