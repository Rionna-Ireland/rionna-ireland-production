import { updatePollDraft } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { pollDraftInput, resolveDraftFields } from "./poll-input";

export const updatePoll = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/polls/{pollId}",
		tags: ["Polls"],
		summary: "Update a draft poll",
	})
	.input(pollDraftInput.extend({ pollId: z.string() }))
	.handler(async ({ input, context }) => {
		const fields = resolveDraftFields(input);
		if (fields.scope === "space" && !fields.circleSpaceId) {
			return { ok: false as const, reason: "space_required" as const };
		}
		const poll = await updatePollDraft({
			organizationId: input.organizationId,
			pollId: input.pollId,
			...fields,
		});
		if (!poll) return { ok: false as const, reason: "not_draft" as const };
		logger.info("Admin updated poll", {
			event: "admin_poll_updated",
			actorUserId: context.user.id,
			organizationId: input.organizationId,
			pollId: poll.id,
		});
		return { ok: true as const, poll };
	});
