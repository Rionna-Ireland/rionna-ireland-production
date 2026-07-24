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
 * - Empty page: bump `circleLastPolledAt`, no cursor change
 *
 * All errors are swallowed at the per-member boundary — a single failing
 * member never blocks the rest of the tick.
 */

import {
	db,
	parseOrgMetadata,
	type CircleNotificationCategory,
} from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
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
	organizationsScanned: number;
	membersEligible: number;
	membersPolled: number;
	notificationsFetched: number;
	pushesSent: number;
	baselined: number;
	driftDetected: number;
	errors: number;
}

export interface PollTickDeps {
	now?: Date;
	concurrency?: number;
	/** Factory override — tests inject a fake CircleService. */
	makeCircleService?: (orgSlug: string) => CircleService;
	/** sendPush override — tests avoid hitting Expo. */
	sendPush?: typeof sendPush;
}

interface OrgPollConfig {
	id: string;
	slug: string;
	circleService: CircleService;
	communityDomain: string | undefined;
	trainerUpdatesSpaceId?: string;
	cadenceMinutes: number;
	enabledCategories: CircleNotificationCategory[];
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
	baselined: boolean;
	driftDetected: boolean;
	/** CircleCallFailure reason when `ok === false`. */
	reason?: CircleCallFailure;
}

export async function pollOneMember(
	input: MemberPollInput,
	deps: { now: Date; sendPush: typeof sendPush },
): Promise<PollOutcome> {
	const { member, org } = input;
	const { now } = deps;

	if (!member.circleMemberId) {
		// Defensive — the caller query already filters this, but a member
		// can race a deprovision in between.
		return {
			ok: true,
			notificationsFetched: 0,
			pushesSent: 0,
			baselined: false,
			driftDetected: false,
		};
	}

	const isFirstPoll = member.circleLastSeenNotificationId === null;
	const isDormantReturn
		= member.circleLastPolledAt !== null
		&& now.getTime() - member.circleLastPolledAt.getTime() > DORMANT_THRESHOLD_MS;
	const isBaselinePoll = isFirstPoll || isDormantReturn;

	const page = await org.circleService.getMemberNotifications(member.circleMemberId, {
		sinceNotificationId: isBaselinePoll ? null : member.circleLastSeenNotificationId,
		limit: 50,
	});

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
			return {
				ok: false,
				notificationsFetched: 0,
				pushesSent: 0,
				baselined: false,
				driftDetected: true,
				reason: "not_found",
			};
		}

		logger.warn("[CirclePoller] getMemberNotifications failed", {
			surface: "circle.poller",
			memberId: member.id,
			organizationId: org.id,
			reason: page.reason,
			retriable: page.retriable,
		});
		return {
			ok: false,
			notificationsFetched: 0,
			pushesSent: 0,
			baselined: false,
			driftDetected: false,
			reason: page.reason,
		};
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
		return {
			ok: true,
			notificationsFetched: items.length,
			pushesSent: 0,
			baselined: true,
			driftDetected: false,
		};
	}

	// Steady state. `tryFanOut` enforces the org's `enabledCategories`
	// filter per-item before calling `sendPush`.
	let pushesSent = 0;

	for (const item of items) {
		const push = await tryFanOut(item, member.userId, org, deps);
		if (push) pushesSent += 1;
	}

	// Persist cursor + polled-at in one write (empty page still bumps
	// polled-at so the dormant check stays honest).
	await db.member.update({
		where: { id: member.id },
		data: {
			circleLastPolledAt: now,
			...(nextCursor !== null && nextCursor !== member.circleLastSeenNotificationId
				? { circleLastSeenNotificationId: nextCursor }
				: {}),
		},
	});

	return {
		ok: true,
		notificationsFetched: items.length,
		pushesSent,
		baselined: false,
		driftDetected: false,
	};
}

async function tryFanOut(
	item: CircleNotification,
	userId: string,
	org: OrgPollConfig,
	deps: { now: Date; sendPush: typeof sendPush },
): Promise<boolean> {
	const ctx: MapCtx = {
		organizationId: org.id,
		communityDomain: org.communityDomain,
		trainerUpdatesSpaceId: org.trainerUpdatesSpaceId,
		horseBySpace: org.horseBySpace,
	};

	const mapped = mapCircleNotification(item, ctx);
	if (!mapped) return false;

	// Per-org enabled-category filter. User-level push preferences (T10)
	// are enforced separately inside `sendPush`; this is the org-admin
	// opt-out surface.
	const category = mapperTriggerToCategory(mapped.triggerType);
	if (!org.enabledCategories.includes(category)) {
		return false;
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
		return true;
	} catch (error) {
		logger.error("[CirclePoller] sendPush threw", {
			surface: "circle.poller",
			organizationId: org.id,
			userId,
			circleNotificationId: item.id,
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

// ──────────────────────────────────────────────
// runCirclePollTick
// ──────────────────────────────────────────────

export async function runCirclePollTick(
	deps: PollTickDeps = {},
): Promise<PollTickMetrics> {
	const now = deps.now ?? new Date();
	const concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;
	const makeCircle = deps.makeCircleService ?? createCircleService;
	const sendPushFn = deps.sendPush ?? sendPush;

	const metrics: PollTickMetrics = {
		organizationsScanned: 0,
		membersEligible: 0,
		membersPolled: 0,
		notificationsFetched: 0,
		pushesSent: 0,
		baselined: 0,
		driftDetected: 0,
		errors: 0,
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

		const cadenceMinutes
			= typeof poll.cadenceMinutes === "number" && poll.cadenceMinutes > 0
				? poll.cadenceMinutes
				: DEFAULT_CADENCE_MINUTES;

		const enabledCategories
			= Array.isArray(poll.enabledCategories) && poll.enabledCategories.length > 0
				? poll.enabledCategories
				: DEFAULT_ENABLED_CATEGORIES;

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
								gte: new Date(
									now.getTime() - FRESH_TOKEN_THRESHOLD_MS,
								),
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
		const eligible = members.filter((m) =>
			pollShard(m.id, now, cadenceMinutes),
		);

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
				.filter((h): h is typeof h & { circleSpaceId: string } =>
					typeof h.circleSpaceId === "string",
				)
				.map((h) => [h.circleSpaceId, { id: h.id, name: h.name }]),
		);

		let circleService: CircleService;
		try {
			circleService = makeCircle(org.slug);
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
			horseBySpace: (spaceId: string) => horseBySpaceMap.get(spaceId) ?? null,
		};

		const tasks = eligible.map((member) => async () => {
			try {
				const outcome = await pollOneMember(
					{ member, org: orgConfig },
					{ now, sendPush: sendPushFn },
				);
				metrics.membersPolled += 1;
				metrics.notificationsFetched += outcome.notificationsFetched;
				metrics.pushesSent += outcome.pushesSent;
				if (outcome.baselined) metrics.baselined += 1;
				if (outcome.driftDetected) metrics.driftDetected += 1;
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
	}

	return metrics;
}
