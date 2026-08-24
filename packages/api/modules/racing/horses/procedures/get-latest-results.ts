import { getLatestResults } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../../orpc/procedures";
import { getAccessibleHorseWhere } from "../lib/horse-access";

export const getLatestResultsProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/horses/latest-results",
		tags: ["Horses"],
		summary: "Get latest race results",
	})
	.input(
		z.object({
			organizationId: z.string(),
			limit: z.number().min(1).max(20).default(3),
		}),
	)
	.handler(async ({ input, context }) => {
		const horseWhere = await getAccessibleHorseWhere({
			organizationId: input.organizationId,
			userId: context.user.id,
		});
		return getLatestResults(input.organizationId, input.limit, horseWhere);
	});
