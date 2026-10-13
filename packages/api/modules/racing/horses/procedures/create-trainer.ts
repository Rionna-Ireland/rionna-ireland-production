import { createTrainer as createTrainerQuery } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const createTrainer = adminProcedure
	.route({
		method: "POST",
		path: "/admin/trainers",
		tags: ["Horses"],
		summary: "Create trainer",
		description: "Create a new trainer for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1),
			location: z.string().trim().min(1).optional(),
		}),
	)
	.handler(async ({ input }) => {
		return createTrainerQuery({
			organizationId: input.organizationId,
			name: input.name,
			location: input.location,
		});
	});
