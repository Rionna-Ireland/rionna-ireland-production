import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { clearEventsCache } from "../../circle/lib/events-cache";
import { descriptionToTiptap } from "../lib/description-to-tiptap";
import { notifyEventPublished } from "../lib/notify-event-published";

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
			inPersonLocation: z.string().optional(),
			virtualLocationUrl: z.string().optional(),
			coverImageSignedId: z.string().optional(),
			notifyMembers: z.boolean().default(true),
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
			inPersonLocation: input.inPersonLocation,
			virtualLocationUrl: input.virtualLocationUrl,
			coverImageSignedId: input.coverImageSignedId,
		});

		if (!outcome.ok) {
			logger.warn("[Events] Circle event creation failed; surfacing fallback", {
				organizationId: input.organizationId,
				reason: outcome.reason,
			});
			return { ok: false as const, reason: outcome.reason };
		}

		logger.info("[Events] Created event", {
			event: "admin_events_created",
			organizationId: input.organizationId,
			circleEventId: outcome.data.circleEventId,
		});

		// A member polling their feed within the 60s TTL, or tapping the
		// EVENT_PUBLISHED push, must see the new event — never a stale cache.
		clearEventsCache();

		if (input.notifyMembers) {
			// Belt-and-suspenders: notifyEventPublished already swallows its own
			// errors, but the event is already committed in Circle either way —
			// a notify failure must never fail the create.
			try {
				await notifyEventPublished({
					organizationId: input.organizationId,
					circleEventId: outcome.data.circleEventId,
					name: input.name,
				});
			} catch (error) {
				logger.error("[Events] publish notify threw unexpectedly", {
					circleEventId: outcome.data.circleEventId,
					error,
				});
			}
		}

		return { ok: true as const, circleEventId: outcome.data.circleEventId };
	});
