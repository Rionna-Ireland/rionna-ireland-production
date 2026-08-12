/**
 * Horse-Space Membership Reconciliation Cron Endpoint (S8-04 §3)
 *
 * Re-asserts a Circle space `join` for every `HorseFollow` row across all
 * orgs — heals silent join failures from S8-03's join-on-follow (which never
 * retries) and any drift that's crept in since. Idempotent, no DB writes.
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
 * @see Architecture/specs/S8-04-horse-space-membership-reconciliation.md
 */

import { isAuthorizedCronRequest } from "@repo/api/lib/cron-auth";
import { reconcileSpaceMemberships } from "@repo/api/modules/racing/horses/lib/reconcile-space-memberships";
import { logger } from "@repo/logs";

// Walks every HorseFollow row across all orgs; give it the same headroom as
// the other daily reconciliation cron.
export const maxDuration = 300;

export async function POST(request: Request) {
	if (!isAuthorizedCronRequest(request)) {
		return new Response("Unauthorized", { status: 401 });
	}

	const summary = await reconcileSpaceMemberships();
	logger.info("space_membership.reconcile.cron.complete", summary);

	return Response.json({ ok: true, summary });
}

// Native Vercel Cron invokes registered paths with GET, not POST — without
// this alias the vercel.json entry would 405 and the daily reconcile would
// silently never run.
export { POST as GET };
