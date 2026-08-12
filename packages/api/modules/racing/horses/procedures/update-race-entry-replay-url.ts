import { ORPCError } from "@orpc/client";
import {
	getRaceEntryById,
	updateRaceEntryReplayUrl as updateRaceEntryReplayUrlQuery,
} from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const updateRaceEntryReplayUrl = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/race-entries/{entryId}/replay-url",
		tags: ["Horses"],
		summary: "Set a race entry's replay link",
		description: "Sets (or clears) the replay-video link surfaced on declarations/results",
	})
	.input(
		z.object({
			entryId: z.string(),
			replayUrl: z.string().url().nullable(),
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

		return updateRaceEntryReplayUrlQuery(input.entryId, input.replayUrl);
	});
