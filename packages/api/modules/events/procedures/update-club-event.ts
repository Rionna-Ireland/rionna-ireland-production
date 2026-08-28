import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { descriptionToTiptap } from "../lib/description-to-tiptap";

export const updateClubEvent = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/events/{eventId}",
		tags: ["Events"],
		summary: "Update a club event in Circle",
	})
	.input(
		z.object({
			organizationId: z.string(),
			eventId: z.string().min(1),
			name: z.string().min(1).optional(),
			description: z.string().optional(),
			startsAt: z.string().optional(),
			durationMinutes: z.number().int().min(1).optional(),
			locationType: z.enum(["tbd", "virtual", "in_person"]).optional(),
			inPersonLocation: z.string().optional(),
			virtualLocationUrl: z.string().optional(),
			coverImageSignedId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			return { ok: false as const, reason: "no_org_slug" };
		}
		const circle = createCircleService(org.slug);
		const outcome = await circle.updateEvent({
			eventId: input.eventId,
			name: input.name,
			tiptapBody:
				input.description !== undefined
					? descriptionToTiptap(input.description)
					: undefined,
			startsAt: input.startsAt,
			durationInSeconds:
				input.durationMinutes !== undefined ? input.durationMinutes * 60 : undefined,
			locationType: input.locationType,
			inPersonLocation: input.inPersonLocation,
			virtualLocationUrl: input.virtualLocationUrl,
			coverImageSignedId: input.coverImageSignedId,
		});
		if (!outcome.ok) {
			logger.warn("[Events] Update failed", {
				eventId: input.eventId,
				reason: outcome.reason,
			});
			return { ok: false as const, reason: outcome.reason };
		}
		logger.info("[Events] Updated event", {
			event: "admin.events.update",
			organizationId: input.organizationId,
			eventId: input.eventId,
			userId: context.user.id,
		});
		return { ok: true as const, circleEventId: input.eventId };
	});
