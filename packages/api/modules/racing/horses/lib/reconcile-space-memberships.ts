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
 * member, not per call). No DB writes.
 *
 * Respects the S8-04 §5 kill-switch: an org with
 * `OrganizationMetadata.features.horseFollows === false` is skipped
 * entirely (logged) rather than churning Circle memberships for a disabled
 * feature. Re-enabling the flag heals any drift on the next run.
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

	for (const org of orgs) {
		const metadata = parseOrgMetadata(org.metadata);
		if (metadata.features?.horseFollows === false) {
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
	};

	logger.info("[Circle] Space membership reconcile summary", {
		surface: "circle.space_membership_reconcile",
		...summary,
	});

	return summary;
}
