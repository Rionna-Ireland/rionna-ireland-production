/**
 * Horse-Space Membership Reconciliation Cron Endpoint (S8-04 §3)
 *
 * Re-asserts a Circle space `join` for every `HorseFollow` row across all
 * orgs — heals silent join failures from S8-03's join-on-follow (which never
 * retries) and any drift that's crept in since. Also re-asserts each org
 * horse's Circle space visibility against `Horse.inviteOnly` (S9-05),
 * healing any drift in the `circleSpaceVisibility` mirror — this is the one
 * source of DB writes in an otherwise read-only membership pass.
 *
 * Registered in `apps/saas/vercel.json` as a native Vercel Cron, which
 * invokes with `GET` (and, when `CRON_SECRET` is set, an
 * `Authorization: Bearer $CRON_SECRET` header Vercel adds automatically) —
 * hence the `GET` alias below. It can also be driven by the external
 * scheduler (cron-job.org) the way `/api/cron/circle-poll` is for its
 * sub-daily ticks, since both methods hit the same authenticated handler.
 *
 * Org iteration, the §5 kill-switch skip, and per-follow concurrency all
 * live inside `reconcileSpaceMemberships`. This route is just the
 * authenticated trigger.
 *
 * S12-02b Task 6 adds a second, independent pass after the horse-follow one:
 * `reconcileAutoJoinMemberships` joins every active member into every
 * admin-chosen `autoJoin` space (spec §10) — this is what makes auto-join
 * deterministic for members provisioned (or spaces flipped on) before the
 * setting existed, since provisioning only sets `spaceIds` at creation time.
 *
 * @see Architecture/specs/S8-04-horse-space-membership-reconciliation.md
 * @see Architecture/specs/S12-02-member-posting-filters-moderation.md §10
 */

import { isAuthorizedCronRequest } from "@repo/api/lib/cron-auth";
import { reconcileAutoJoinMemberships } from "@repo/api/modules/community/lib/reconcile-auto-join";
import { reconcileSpaceMemberships } from "@repo/api/modules/racing/horses/lib/reconcile-space-memberships";
import { logger } from "@repo/logs";

// Walks every HorseFollow row across all orgs; give it the same headroom as
// the other daily reconciliation cron.
export const maxDuration = 300;

export async function POST(request: Request) {
	if (!isAuthorizedCronRequest(request)) {
		return new Response("Unauthorized", { status: 401 });
	}

	const horseSpaceSummary = await reconcileSpaceMemberships();
	logger.info("space_membership.reconcile.cron.complete", horseSpaceSummary);

	// S12-02b Task 6: second pass — join every active member into every
	// admin-chosen autoJoin space (spec §10). Independent of the horse-follow
	// pass above; a failure here never blocks or is blocked by it.
	const autoJoinSummary = await reconcileAutoJoinMemberships();
	logger.info("community.auto_join.reconcile.cron.complete", autoJoinSummary);

	return Response.json({
		ok: true,
		summary: { horseSpaceMemberships: horseSpaceSummary, autoJoin: autoJoinSummary },
	});
}

// Native Vercel Cron invokes registered paths with GET, not POST — without
// this alias the vercel.json entry would 405 and the daily reconcile would
// silently never run.
export { POST as GET };
