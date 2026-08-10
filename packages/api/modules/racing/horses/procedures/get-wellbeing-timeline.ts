import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../../orpc/procedures";
import { listPublishedWellbeingTimeline } from "../lib/wellbeing-updates";

export const getWellbeingTimelineProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/horses/{horseId}/wellbeing",
		tags: ["Horses"],
		summary: "Get a horse's published wellbeing timeline",
		description: "Published wellbeing updates for a horse, newest first, visible to members",
	})
	.input(z.object({ horseId: z.string() }))
	.handler(async ({ input, context }) => {
		if (!context.session.activeOrganizationId) {
			throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
		}

		const horse = await db.horse.findFirst({
			where: {
				id: input.horseId,
				organizationId: context.session.activeOrganizationId,
				publishedAt: { not: null },
			},
			select: { id: true },
		});
		if (!horse) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}

		return listPublishedWellbeingTimeline({
			organizationId: context.session.activeOrganizationId,
			horseId: input.horseId,
		});
	});
