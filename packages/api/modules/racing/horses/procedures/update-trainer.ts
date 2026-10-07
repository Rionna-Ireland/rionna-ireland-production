import { ORPCError } from "@orpc/client";
import { getTrainerById, updateTrainerLocation } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const updateTrainer = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/trainers/{trainerId}",
		tags: ["Horses"],
		summary: "Update trainer",
		description:
			"Set (or clear) a trainer's location. Provider sync only fills this while empty, so a value set here is an override.",
	})
	.input(
		z.object({
			trainerId: z.string(),
			location: z.string().trim().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		const trainer = await getTrainerById(input.trainerId);

		if (!trainer || trainer.organizationId !== context.session.activeOrganizationId) {
			throw new ORPCError("NOT_FOUND", { message: "Trainer not found" });
		}

		return updateTrainerLocation(input.trainerId, input.location || null);
	});
