import { db } from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";
import type { EventAttendee } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

export type ListEventAttendeesResult =
	| { ok: true; attendees: EventAttendee[]; count: number }
	| { ok: false; reason: string };

export const listEventAttendees = adminProcedure
	.route({
		method: "GET",
		path: "/admin/events/{eventId}/attendees",
		tags: ["Events"],
		summary: "List an event's RSVPs (admin contact list)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			eventId: z.string().min(1),
		}),
	)
	.handler(async ({ input }): Promise<ListEventAttendeesResult> => {
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			return { ok: false, reason: "no_org_slug" };
		}
		const circle = createCircleService(org.slug);
		const outcome = await circle.listEventAttendees({ eventId: input.eventId });
		if (!outcome.ok) {
			return { ok: false, reason: outcome.reason };
		}
		return { ok: true, attendees: outcome.data.attendees, count: outcome.data.count };
	});
