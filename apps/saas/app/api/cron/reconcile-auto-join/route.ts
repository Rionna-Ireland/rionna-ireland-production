/**
 * Auto-Join Membership Reconciliation Cron Endpoint (S12-02b Task 6, spec §10)
 *
 * Joins every active, provisioned member into every admin-chosen `autoJoin`
 * Circle space — this is what makes auto-join deterministic for members
 * provisioned (or spaces flipped on) before the setting existed, since
 * provisioning only sets `spaceIds` at creation time.
 *
 * Split out of `/api/cron/reconcile-space-memberships`, where it ran after
 * the horse-follow pass and could be starved of `maxDuration` by it. The
 * pass carries its own wall-clock budget and resume cursor
 * (`AUTO_JOIN_TIME_BUDGET_MS`, `circle.autoJoinCursor`).
 *
 * Registered in `apps/saas/vercel.json` as a native Vercel Cron (GET, with
 * `Authorization: Bearer $CRON_SECRET`); POST works too for an external
 * scheduler.
 *
 * @see Architecture/specs/S12-02-member-posting-filters-moderation.md §10
 */

import { isAuthorizedCronRequest } from "@repo/api/lib/cron-auth";
import { reconcileAutoJoinMemberships } from "@repo/api/modules/community/lib/reconcile-auto-join";
import { logger } from "@repo/logs";

export const maxDuration = 300;

export async function POST(request: Request) {
	if (!isAuthorizedCronRequest(request)) {
		return new Response("Unauthorized", { status: 401 });
	}

	const autoJoinSummary = await reconcileAutoJoinMemberships();
	logger.info("community.auto_join.reconcile.cron.complete", autoJoinSummary);

	return Response.json({ ok: true, summary: { autoJoin: autoJoinSummary } });
}

// Native Vercel Cron invokes registered paths with GET, not POST.
export { POST as GET };
