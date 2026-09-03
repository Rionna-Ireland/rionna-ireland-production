/**
 * Charity Revenue Sync Cron (S12-01 §2)
 *
 * Refreshes the cached gross Stripe subscription revenue on every org's current
 * `CharityConfig` so member reads of the charity total never call Stripe. The
 * admin "Recalculate now" button hits the same `syncCharityRevenue` function.
 *
 * Registered in `apps/saas/vercel.json` as a native Vercel Cron (daily, 02:00),
 * which invokes with `GET` + `Authorization: Bearer $CRON_SECRET` — hence the
 * `GET` alias below.
 *
 * @see Architecture/specs/S12-01-paddock-build.md
 */

import { isAuthorizedCronRequest } from "@repo/api/lib/cron-auth";
import { syncAllCharityRevenue } from "@repo/api/modules/charity/lib/sync-charity-revenue";
import { logger } from "@repo/logs";

// One paginated Stripe walk per org; generous headroom like the other daily crons.
export const maxDuration = 300;

export async function POST(request: Request) {
	if (!isAuthorizedCronRequest(request)) {
		return new Response("Unauthorized", { status: 401 });
	}

	const summary = await syncAllCharityRevenue();
	logger.info("charity.revenue.cron.complete", summary);

	return Response.json({ ok: true, summary });
}

// Native Vercel Cron invokes registered paths with GET, not POST — without
// this alias the vercel.json entry would 405 and the daily sync would
// silently never run.
export { POST as GET };
