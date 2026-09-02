import { db } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

/** Space-scope target picker: horses that have a Circle space. */
export const listPollSpaces = adminProcedure
	.route({
		method: "GET",
		path: "/admin/poll-spaces",
		tags: ["Polls"],
		summary: "Poll space targets",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input }) => {
		const horses = await db.horse.findMany({
			where: { organizationId: input.organizationId, circleSpaceId: { not: null } },
			select: { id: true, name: true, circleSpaceId: true },
			orderBy: { name: "asc" },
		});
		return {
			spaces: horses.map((h) => ({
				horseId: h.id,
				name: h.name,
				circleSpaceId: h.circleSpaceId as string,
			})),
		};
	});
