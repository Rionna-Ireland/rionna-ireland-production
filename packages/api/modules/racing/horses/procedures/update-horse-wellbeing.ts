import { ORPCError } from "@orpc/client";
import { getHorseById, upsertHorseWellbeing } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const updateHorseWellbeing = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/horses/{horseId}/wellbeing",
		tags: ["Horses"],
		summary: "Set a horse's wellbeing",
		description:
			"Upserts the structured wellbeing row (vet check + training load). Pass nulls to clear a field.",
	})
	.input(
		z.object({
			horseId: z.string(),
			vetCheckStatus: z.enum(["ALL_CLEAR", "MONITORING", "TREATMENT"]).nullable(),
			vetCheckedAt: z.date().nullable(),
			trainingLoad: z.enum(["RESTING", "LIGHT", "BUILDING", "FULL"]).nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		const horse = await getHorseById(input.horseId);

		if (!horse || horse.organizationId !== context.session.activeOrganizationId) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}

		return upsertHorseWellbeing(input.horseId, {
			vetCheckStatus: input.vetCheckStatus,
			vetCheckedAt: input.vetCheckedAt,
			trainingLoad: input.trainingLoad,
		});
	});
