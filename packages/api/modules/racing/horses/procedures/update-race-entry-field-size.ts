import { ORPCError } from "@orpc/client";
import { getRaceEntryById, updateRaceEntryFieldSize as updateFieldSizeQuery } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const updateRaceEntryFieldSize = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/race-entries/{entryId}/field-size",
		tags: ["Horses"],
		summary: "Set a race entry's field size",
		description: "Sets (or clears) the number of runners in the race, for manual result entry",
	})
	.input(
		z.object({
			entryId: z.string(),
			fieldSize: z.number().int().min(1).max(60).nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.session.activeOrganizationId) {
			throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
		}

		const entry = await getRaceEntryById(input.entryId);

		if (!entry || entry.organizationId !== context.session.activeOrganizationId) {
			throw new ORPCError("NOT_FOUND", { message: "Race entry not found" });
		}

		const result = await updateFieldSizeQuery(input.entryId, input.fieldSize);
		logger.info("Admin updated race entry field size", {
			event: "admin_race_entry_field_size_updated",
			actorUserId: context.user.id,
			organizationId: entry.organizationId,
			entryId: input.entryId,
			changedFields: ["fieldSize"],
			fieldSize: input.fieldSize,
		});
		return result;
	});
