import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { memberProcedure } from "../../../orpc/procedures";
import { invalidateEventsCacheForMember } from "../lib/events-cache";
import { memberCircleFetch } from "../lib/member-circle-fetch";

export type RsvpEventResult =
	| { ok: true; going: boolean }
	| { ok: false; reason: "not_a_member" | "event_full" | "rsvp_disabled" | "circle_error" };

/**
 * RSVP / un-RSVP the authenticated member to a Circle event (member-token
 * POST/DELETE on event_attendees). Un-RSVP treats a 404 as success —
 * "already not going" is the requested state. Invalidate the member's
 * events cache on success so the toggle reads back correctly.
 */
export const rsvpEvent = memberProcedure
	.route({
		method: "POST",
		path: "/circle/events/rsvp",
		tags: ["Circle"],
		summary: "RSVP or cancel RSVP for a club event",
	})
	.input(
		z.object({
			organizationId: z.string(),
			eventId: z.string().min(1),
			going: z.boolean(),
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<RsvpEventResult> => {
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}
		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return { ok: false, reason: "not_a_member" };
		}

		const response = await memberCircleFetch(
			{ orgSlug: org.slug, circleMemberId: member.circleMemberId },
			`/events/${encodeURIComponent(input.eventId)}/event_attendees`,
			{ method: input.going ? "POST" : "DELETE" },
			{ surface: "circle.events", userId: user.id, eventId: input.eventId },
		);
		if (!response) return { ok: false, reason: "circle_error" };

		if (!response.ok && !(response.status === 404 && !input.going)) {
			const raw = await response.text().catch(() => "");
			const reason = /limit|full|capacity/i.test(raw)
				? ("event_full" as const)
				: /disabled/i.test(raw)
					? ("rsvp_disabled" as const)
					: ("circle_error" as const);
			logger.warn("[Circle] RSVP failed", {
				surface: "circle.events",
				eventId: input.eventId,
				going: input.going,
				status: response.status,
				reason,
			});
			return { ok: false, reason };
		}

		invalidateEventsCacheForMember(input.organizationId, user.id);
		logger.info("[Circle] RSVP", {
			surface: "circle.events",
			eventId: input.eventId,
			going: input.going,
		});
		return { ok: true, going: input.going };
	});
