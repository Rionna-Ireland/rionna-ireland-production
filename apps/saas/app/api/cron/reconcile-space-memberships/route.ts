/**
 * Horse-Space Membership Reconciliation Cron Endpoint (S8-04 §3)
 *
 * Runs daily via Vercel Cron. Re-asserts a Circle space `join` for every
 * `HorseFollow` row across all orgs — heals silent join failures from
 * S8-03's join-on-follow (which never retries) and any drift that's crept
 * in since. Idempotent, no DB writes.
 *
 * Org iteration, the §5 kill-switch skip, and per-follow concurrency all
 * live inside `reconcileSpaceMemberships`. This route is just the
 * authenticated trigger (mirrors `/api/cron/circle-poll`).
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
