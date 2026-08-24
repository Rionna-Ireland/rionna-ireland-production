/**
 * Standing horse-space membership reconciliation (S8-04 §3).
 *
 * Heals silent join failures (`syncCircleSpaceMembership` never throws and
 * never retries — S8-04 §Context) and any future drift between the app's
 * `HorseFollow` rows and Circle space membership, without diffing: every
 * `HorseFollow` row gets a re-asserted `join` call. Joining an
 * already-joined space is idempotent from the caller's perspective (the
 * helper treats non-2xx as a warn-and-continue), so this is safe to run
 * daily against every follow in the org.
 *
 * At single-club scale this is O(follows) ≈ low hundreds of Circle calls/day
 * — comfortably inside quota (the member token cache means ~1 mint per
 * member, not per call). The membership pass itself makes no DB writes.
 *
 * Also re-asserts Circle space visibility (S9-05): for every org horse with
 * an active space, `circleSpaceVisibility` (the DB mirror) is diffed against
 * `Horse.inviteOnly` — the source of truth — and any mismatch is corrected
 * Circle-first (`setSpaceVisibility`) before the mirror is written, counted
 * in `visibilityFixed`. This is the pass's one source of DB writes, and it
 * heals both `update-horse`'s Circle-first failures (mirror left stale) and
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

		const follows = await db.horseFollow.findMany({
			where: { organizationId: org.id },
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
					}
				} catch (error) {
					failed++;
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
