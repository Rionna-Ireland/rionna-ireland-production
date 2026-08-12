import { ORPCError } from "@orpc/client";
import { getHorseById, getHorseEntriesForAdmin } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const listHorseEntries = adminProcedure
	.route({
		method: "GET",
		path: "/admin/horses/{horseId}/entries",
		tags: ["Horses"],
		summary: "List a horse's race entries",
		description: "Recent declarations/results for the horse, for setting replay links",
	})
	.input(z.object({ horseId: z.string() }))
	.handler(async ({ input, context }) => {
		const horse = await getHorseById(input.horseId);

		if (!horse || horse.organizationId !== context.session.activeOrganizationId) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}

		return getHorseEntriesForAdmin(input.horseId);
	});
