import { db, parseOrgMetadata } from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";
import type { ClubEventSummary } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

export type ListClubEventsResult =
	| { ok: true; configured: boolean; events: ClubEventSummary[] }
	| { ok: false; reason: string };

export const listClubEvents = adminProcedure
	.route({
		method: "GET",
		path: "/admin/events",
		tags: ["Events"],
		summary: "List the club's Circle events (admin, with RSVP counts)",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input }): Promise<ListClubEventsResult> => {
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			return { ok: false, reason: "no_org_slug" };
		}
		const eventsSpaceId = parseOrgMetadata(org.metadata).circle?.eventsSpaceId;
		if (!eventsSpaceId) {
			return { ok: true, configured: false, events: [] };
		}
		const circle = createCircleService(org.slug);
		const outcome = await circle.listEvents({
			spaceId: eventsSpaceId,
			sort: "start_date_desc",
		});
		if (!outcome.ok) {
			return { ok: false, reason: outcome.reason };
		}
		return { ok: true, configured: true, events: outcome.data.events };
	});
