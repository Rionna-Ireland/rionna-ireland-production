import { getNextRun } from "@repo/database";
import { z } from "zod";

import { memberProcedure } from "../../../../orpc/procedures";
import { getAccessibleHorseWhere } from "../lib/horse-access";

export const getNextRunProcedure = memberProcedure
	.route({
		method: "GET",
		path: "/horses/next-run",
		tags: ["Horses"],
		summary: "Get next declared run across all horses",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		const horseWhere = await getAccessibleHorseWhere({
			organizationId: input.organizationId,
			userId: context.user.id,
		});
		return getNextRun(input.organizationId, horseWhere);
	});
