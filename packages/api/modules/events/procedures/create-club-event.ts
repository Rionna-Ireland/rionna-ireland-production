import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { descriptionToTiptap } from "../lib/description-to-tiptap";

/**
 * Create a Circle event (S2-09 surface E) via `POST /events` — RSVP + reminders
 * are built into Circle events. Fail-safe like the publish flow: a missing
 * events space or a Circle failure returns `{ ok: false }` (no throw) so the UI
 * can offer "create it directly in Circle". No local Event model (D10).
 */
export const createClubEvent = adminProcedure
	.route({
		method: "POST",
		path: "/admin/events",
		tags: ["Events"],
		summary: "Create a native event in the club's Circle events space",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1),
			description: z.string().default(""),
			startsAt: z.string(),
			durationMinutes: z.number().int().min(1),
			locationType: z.enum(["tbd", "virtual", "in_person"]).optional(),
		}),
	)
	.handler(async ({ input }) => {
		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
		});
		if (!org?.slug) {
			return { ok: false as const, reason: "no_org_slug" };
		}

		const eventsSpaceId = parseOrgMetadata(org.metadata).circle?.eventsSpaceId;
		if (!eventsSpaceId) {
			logger.warn("[Events] No eventsSpaceId configured", {
				organizationId: input.organizationId,
			});
			return { ok: false as const, reason: "no_events_space" };
		}

		const circle = createCircleService(org.slug);
		const outcome = await circle.createEvent({
			spaceId: eventsSpaceId,
			name: input.name,
			tiptapBody: descriptionToTiptap(input.description),
			startsAt: input.startsAt,
			durationInSeconds: input.durationMinutes * 60,
			locationType: input.locationType ?? "tbd",
		});

		if (!outcome.ok) {
			logger.warn("[Events] Circle event creation failed; surfacing fallback", {
				organizationId: input.organizationId,
				reason: outcome.reason,
			});
			return { ok: false as const, reason: outcome.reason };
		}

		logger.info("[Events] Created event", {
			organizationId: input.organizationId,
			circleEventId: outcome.data.circleEventId,
		});
		return { ok: true as const, circleEventId: outcome.data.circleEventId };
	});
