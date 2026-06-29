/**
 * Timeform Ingest Cron Endpoint
 *
 * Runs every 15 minutes via an authenticated scheduler.
 *
 * Temporary deployment note: Vercel Hobby only allows daily cron jobs, so
 * sub-daily invocation currently comes from an external scheduler
 * (for now, `cron-job.org`) hitting this route with `CRON_SECRET`.
 * If the project moves to Vercel Pro, this can go back to a native
 * Vercel Cron schedule.
 *
 * Polls the racing data provider, diffs state against DB,
 * and fires pushes on transitions.
 *
 * @see Architecture/specs/S1-07-ingest-worker.md
 */

import { isAuthorizedCronRequest } from "@repo/api/lib/cron-auth";
import { runIngestForAllOrgs } from "@repo/api/modules/racing/ingest/orchestrator";

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  await runIngestForAllOrgs();
  return Response.json({ ok: true });
}
