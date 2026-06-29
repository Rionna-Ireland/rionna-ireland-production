/**
 * Circle Notification Poller Cron Endpoint
 *
 * Runs every minute via an authenticated scheduler.
 *
 * Temporary deployment note: Vercel Hobby only allows daily cron jobs, so
 * sub-daily invocation currently comes from an external scheduler
 * (for now, `cron-job.org`) hitting this route with `CRON_SECRET`.
 * If the project moves to Vercel Pro, this can go back to a native
 * Vercel Cron schedule.
 *
 * Polls Circle for new notifications across all eligible members and
 * fires pushes on mapped triggers.
 *
 * Org iteration, per-org sharding, per-member concurrency, and all
 * per-org/per-member error handling live inside `runCirclePollTick`
 * (S6-01 / T11). This route is just an authenticated trigger.
 *
 * @see Architecture/specs/S6-01-circle-notifications.md
 */

import { isAuthorizedCronRequest } from "@repo/api/lib/cron-auth";
import { runCirclePollTick } from "@repo/api/modules/circle/poller";
import { logger } from "@repo/logs";

export async function POST(request: Request) {
	if (!isAuthorizedCronRequest(request)) {
		return new Response("Unauthorized", { status: 401 });
	}

	const metrics = await runCirclePollTick();
	logger.info("circle.poll.cron.complete", metrics);

	return Response.json({ ok: true, metrics });
}
