import { ORPCError } from "@orpc/client";
import { deleteHorse as deleteHorseQuery, getHorseById } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const deleteHorse = adminProcedure
	.route({
		method: "DELETE",
		path: "/admin/horses/{horseId}",
		tags: ["Horses"],
		summary: "Delete horse",
		description: "Delete a horse",
	})
	.input(
		z.object({
			horseId: z.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		const existing = await getHorseById(input.horseId);

		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}

		await deleteHorseQuery(input.horseId);

		logger.info("Admin deleted horse", {
			event: "admin_horse_deleted",
			actorUserId: context.user.id,
			organizationId: existing.organizationId,
			horseId: input.horseId,
		});

		return { success: true };
	});
