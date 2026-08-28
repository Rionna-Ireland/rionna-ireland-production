import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { clearEventsCache } from "../../circle/lib/events-cache";

export const deleteClubEvent = adminProcedure
	.route({
		method: "DELETE",
		path: "/admin/events/{eventId}",
		tags: ["Events"],
		summary: "Delete a club event in Circle",
	})
	.input(
		z.object({
			organizationId: z.string(),
			eventId: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			return { ok: false as const, reason: "no_org_slug" };
		}
		const circle = createCircleService(org.slug);
		const outcome = await circle.deleteEvent({ eventId: input.eventId });
		if (!outcome.ok) {
			logger.warn("[Events] Delete failed", {
				eventId: input.eventId,
				reason: outcome.reason,
			});
			return { ok: false as const, reason: outcome.reason };
		}
		logger.info("[Events] Deleted event", {
			event: "admin_events_deleted",
			organizationId: input.organizationId,
			eventId: input.eventId,
			userId: context.user.id,
		});
		// A member polling their feed within the 60s TTL, or tapping the
		// EVENT_PUBLISHED push, must not still see the deleted event.
		clearEventsCache();
		return { ok: true as const };
	});
