import { publishHorses as publishHorsesQuery } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const publishHorses = adminProcedure
	.route({
		method: "POST",
		path: "/admin/horses/publish",
		tags: ["Horses"],
		summary: "Publish or unpublish horses",
		description: "Batch publish or unpublish horses by setting or clearing publishedAt",
	})
	.input(
		z.object({
			horseIds: z.array(z.string()).min(1),
			publish: z.boolean(),
		}),
	)
	.handler(async ({ input, context }) => {
		await publishHorsesQuery(input.horseIds, input.publish);

		logger.info("Admin published/unpublished horses", {
			event: "admin_horses_published",
			actorUserId: context.user.id,
			horseIds: input.horseIds,
			publish: input.publish,
		});

		return { success: true };
	});
