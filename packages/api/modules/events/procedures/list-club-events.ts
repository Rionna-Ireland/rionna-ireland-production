import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import type { ClubEventSummary } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

/** Hard cap on pages fetched per request — bounds worst-case latency/load. */
const MAX_PAGES = 5;

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
		const events: ClubEventSummary[] = [];
		let page = 1;
		let hasNextPage = true;
		while (hasNextPage && page <= MAX_PAGES) {
			const outcome = await circle.listEvents({
				spaceId: eventsSpaceId,
				sort: "start_date_desc",
				page,
			});
			if (!outcome.ok) {
				return { ok: false, reason: outcome.reason };
			}
			events.push(...outcome.data.events);
			hasNextPage = outcome.data.hasNextPage;
			page++;
		}
		if (hasNextPage) {
			logger.warn("[Events] listClubEvents hit the page cap with more events remaining", {
				organizationId: input.organizationId,
				eventsSpaceId,
				maxPages: MAX_PAGES,
			});
		}
		return { ok: true, configured: true, events };
	});
