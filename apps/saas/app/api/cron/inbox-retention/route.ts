/**
 * Inbox retention cron (S12-06 §7). Daily, via the external cron-job.eu
 * scheduler with `Authorization: Bearer $CRON_SECRET` — not vercel.json.
 *
 * @see Architecture/specs/S12-06-notification-centre.md
 */

import { isAuthorizedCronRequest } from "@repo/api/lib/cron-auth";
import { deleteExpiredInboxItems } from "@repo/api/modules/inbox/retention";
import { logger } from "@repo/logs";

export const maxDuration = 60;

export async function POST(request: Request) {
	if (!isAuthorizedCronRequest(request)) {
		return new Response("Unauthorized", { status: 401 });
	}

	const result = await deleteExpiredInboxItems();
	logger.info("inbox.retention.complete", result);

	return Response.json({ ok: true, ...result });
}
