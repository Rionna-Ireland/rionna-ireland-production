/**
 * Standing horse-space membership reconciliation (S8-04 §3).
 *
 * Heals silent join failures (`syncCircleSpaceMembership` never throws and
 * never retries — S8-04 §Context). Incremental: only `HorseFollow` rows
 * with no successful join stamped (`circleJoinedAt` null) and fewer than
 * `MAX_JOIN_ATTEMPTS` failed attempts get a re-asserted `join`. With horse
 * auto-follow on, every member follows every public horse, so re-asserting
 * every follow daily was O(members × horses) Circle calls and outgrew the
 * cron's `maxDuration`; steady state is now ~0 calls. Drift made directly
 * in Circle (a member removed from a space by hand) is not detected, since
 * the stamp is never cleared by Circle-side changes.
 *
 * Each failed attempt increments `circleJoinAttempts` (its only DB write
 * besides the visibility mirror below); a success stamps `circleJoinedAt`
 * inside the helper. Because successes are stamped as they happen, a run
 * killed mid-sweep resumes where it left off on the next run.
 *
 * Also re-asserts Circle space visibility (S9-05): for every org horse with
 * an active space, `circleSpaceVisibility` (the DB mirror) is diffed against
 * `Horse.inviteOnly` — the source of truth — and any mismatch is corrected
 * Circle-first (`setSpaceVisibility`) before the mirror is written, counted
 * in `visibilityFixed`. This heals both `update-horse`'s Circle-first
 * failures (mirror left stale) and
 * any manual/out-of-band drift in Circle itself. Historic mirror rows may
 * carry the legacy `"member_public"` value; any value other than `"private"`
 * is treated as public when diffing.
 *
 * Respects the S8-04 §5 kill-switch: an org with
 * `OrganizationMetadata.features.horseFollows === false` has its
 * `HorseFollow` membership re-assert pass skipped entirely (logged) rather
 * than churning Circle memberships for a disabled feature. Re-enabling the
 * flag heals any drift on the next run. The kill-switch disables the follow
 * *feature*, never privacy: the S9-05 visibility re-assert below runs for
 * every org regardless, including kill-switch-disabled ones.
 *
 * Follows are pre-filtered the same way the §1 backfill script
 * (`backfill-horse-space-joins.ts`) does before a `HorseFollow` row is
 * counted as an attempt: `syncCircleSpaceMembership` returns `ok:false` for
 * two benign, structural, non-error cases — the member has no
 * `circleMemberId` yet (not Circle-provisioned) or the horse has no active
 * `circleSpaceId` — and those would otherwise be indistinguishable from a
 * genuine join failure, permanently inflating `failed` and making "daily
 * reconcile runs green" unobservable. Rows that don't clear the pre-filter
 * are counted as `skipped`, not attempted.
 *
 * @see Architecture/specs/S8-04-horse-space-membership-reconciliation.md
 */

import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import { syncCircleSpaceMembership } from "@repo/payments/lib/circle-space-membership";

import { runBounded } from "../../../circle/lib/run-bounded";

const CONCURRENCY = 5;

/**
 * Failed reconcile attempts after which a follow stops being retried. Bounds
 * the daily Circle work if a join fails permanently (e.g. Circle answers a
 * re-join with a non-2xx). A later successful join from any path resets it.
 */
export const MAX_JOIN_ATTEMPTS = 5;

export interface ReconcileSpaceMembershipsSummary {
	orgsProcessed: number;
	orgsSkippedDisabled: number;
	totalFollows: number;
	/** Pre-filtered out: member not yet Circle-provisioned, or horse has no active space. */
	skipped: number;
	joined: number;
	failed: number;
	/**
	 * S9-05: horses whose `circleSpaceVisibility` mirror disagreed with
	 * `inviteOnly` and were re-asserted against Circle + re-mirrored.
	 */
	visibilityFixed: number;
}

interface Candidate {
	userId: string;
	horseId: string;
}

async function recordFailedAttempt(candidate: Candidate): Promise<void> {
	try {
		await db.horseFollow.updateMany({
			where: { userId: candidate.userId, horseId: candidate.horseId },
			data: { circleJoinAttempts: { increment: 1 } },
		});
	} catch (error) {
		logger.warn("[Circle] Space membership reconcile: failed to record join attempt", {
			surface: "circle.space_membership_reconcile",
			userId: candidate.userId,
			horseId: candidate.horseId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function reconcileSpaceMemberships(): Promise<ReconcileSpaceMembershipsSummary> {
	const orgs = await db.organization.findMany({ select: { id: true, metadata: true, slug: true } });

	let orgsProcessed = 0;
	let orgsSkippedDisabled = 0;
	let totalFollows = 0;
	let skipped = 0;
	let joined = 0;
	let failed = 0;
	let visibilityFixed = 0;

	for (const org of orgs) {
		const metadata = parseOrgMetadata(org.metadata);
		const followFeatureDisabled = metadata.features?.horseFollows === false;

		// S9-05: re-assert Circle space visibility against Horse.inviteOnly for
		// every org horse with an active space — independent of follows, so it
		// runs even for orgs with zero HorseFollow rows, AND independent of the
		// S8-04 §5 kill-switch below: the kill-switch disables the follow
		// *feature*, never privacy, so a "disabled" org still gets its
		// visibility drift healed. A horse's mirror (`circleSpaceVisibility`)
		// can only ever be "private" or "public" going forward (see
		// provisioning/update-horse), but historic rows may still carry the
		// legacy "member_public" value; any non-"private" value is treated as
		// public when diffing.
		const activeHorses = await db.horse.findMany({
			where: { organizationId: org.id, circleSpaceStatus: "active", circleSpaceId: { not: null } },
			select: { id: true, circleSpaceId: true, inviteOnly: true, circleSpaceVisibility: true },
		});

		const mismatchedHorses = activeHorses.filter((horse) => {
			if (!horse.circleSpaceId) return false;
			const isInviteOnly = Boolean(horse.inviteOnly);
			const mirroredPrivate = horse.circleSpaceVisibility === "private";
			return isInviteOnly !== mirroredPrivate;
		});

		if (mismatchedHorses.length > 0 && !org.slug) {
			logger.warn("[Circle] Space visibility reconcile: org has no slug, cannot build Circle service", {
				surface: "circle.space_membership_reconcile",
				organizationId: org.id,
			});
		}

		if (mismatchedHorses.length > 0 && org.slug) {
			const circle = createCircleService(org.slug);

			for (const horse of mismatchedHorses) {
				if (!horse.circleSpaceId) continue;

				const isInviteOnly = Boolean(horse.inviteOnly);

				const outcome = await circle.setSpaceVisibility({
					spaceId: horse.circleSpaceId,
					isPrivate: isInviteOnly,
				});

				if (outcome.ok) {
					await db.horse.update({
						where: { id: horse.id },
						data: { circleSpaceVisibility: isInviteOnly ? "private" : "public" },
					});
					visibilityFixed++;
				} else {
					logger.warn("[Circle] Space visibility reconcile: setSpaceVisibility failed, mirror left stale", {
						surface: "circle.space_membership_reconcile",
						organizationId: org.id,
						horseId: horse.id,
						inviteOnly: isInviteOnly,
						reason: outcome.reason,
						retriable: outcome.retriable,
					});
				}
			}
		}

		// S8-04 §5 kill-switch: skip the HorseFollow membership re-assert pass
		// for a disabled org (visibility healing above already ran regardless).
		if (followFeatureDisabled) {
			orgsSkippedDisabled++;
			logger.info("[Circle] Space membership reconcile: org disabled, skipping", {
				surface: "circle.space_membership_reconcile",
				organizationId: org.id,
			});
			continue;
		}
		orgsProcessed++;

		// Incremental: only follows that have never had a successful join
		// stamped (`circleJoinedAt`, set by `syncCircleSpaceMembership`) and
		// haven't exhausted their retry budget. Already-joined follows cost
		// nothing, so a steady-state run makes ~0 Circle calls.
		const follows = await db.horseFollow.findMany({
			where: {
				organizationId: org.id,
				circleJoinedAt: null,
				circleJoinAttempts: { lt: MAX_JOIN_ATTEMPTS },
			},
			select: { userId: true, horseId: true },
		});
		totalFollows += follows.length;
		if (follows.length === 0) continue;

		// Pre-filter the way backfill-horse-space-joins.ts does: only attempt a
		// join for follows whose member is Circle-provisioned and whose horse
		// has an active Circle space. Everything else is a structural skip, not
		// a failure — there's nothing to join yet.
		const userIds = [...new Set(follows.map((f) => f.userId))];
		const horseIds = [...new Set(follows.map((f) => f.horseId))];

		const members = await db.member.findMany({
			where: { organizationId: org.id, userId: { in: userIds } },
			select: { userId: true, circleMemberId: true },
		});
		const circleMemberIdByUserId = new Map(members.map((m) => [m.userId, m.circleMemberId]));

		const horses = await db.horse.findMany({
			where: { organizationId: org.id, id: { in: horseIds } },
			select: { id: true, circleSpaceId: true, circleSpaceStatus: true },
		});
		const horseById = new Map(horses.map((h) => [h.id, h]));

		const candidates: Candidate[] = [];
		for (const follow of follows) {
			const hasMember = Boolean(circleMemberIdByUserId.get(follow.userId));
			const horse = horseById.get(follow.horseId);
			const hasActiveSpace = Boolean(horse?.circleSpaceId) && horse?.circleSpaceStatus === "active";
			if (!hasMember || !hasActiveSpace) {
				skipped++;
				continue;
			}
			candidates.push({ userId: follow.userId, horseId: follow.horseId });
		}
		if (candidates.length === 0) continue;

		await runBounded(
			CONCURRENCY,
			candidates.map((candidate) => async () => {
				try {
					const outcome = await syncCircleSpaceMembership({
						organizationId: org.id,
						userId: candidate.userId,
						horseId: candidate.horseId,
						action: "join",
					});
					if (outcome.ok) {
						joined++;
					} else {
						failed++;
						await recordFailedAttempt(candidate);
					}
				} catch (error) {
					failed++;
					await recordFailedAttempt(candidate);
					logger.warn("[Circle] Space membership reconcile: join threw unexpectedly", {
						surface: "circle.space_membership_reconcile",
						organizationId: org.id,
						userId: candidate.userId,
						horseId: candidate.horseId,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}),
		);
	}

	const summary: ReconcileSpaceMembershipsSummary = {
		orgsProcessed,
		orgsSkippedDisabled,
		totalFollows,
		skipped,
		joined,
		failed,
		visibilityFixed,
	};

	logger.info("[Circle] Space membership reconcile summary", {
		surface: "circle.space_membership_reconcile",
		...summary,
	});

	return summary;
}
