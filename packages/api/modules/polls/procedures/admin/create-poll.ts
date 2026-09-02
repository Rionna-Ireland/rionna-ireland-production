import { createPoll as createPollRow } from "@repo/database";
import { logger } from "@repo/logs";

import { adminProcedure } from "../../../../orpc/procedures";
import { pollDraftInput, resolveDraftFields } from "./poll-input";

export const createPoll = adminProcedure
	.route({
		method: "POST",
		path: "/admin/polls",
		tags: ["Polls"],
		summary: "Create a draft poll",
	})
	.input(pollDraftInput)
	.handler(async ({ input, context }) => {
		const fields = resolveDraftFields(input);
		if (fields.scope === "space" && !fields.circleSpaceId) {
			return { ok: false as const, reason: "space_required" as const };
		}
		const poll = await createPollRow({
			organizationId: input.organizationId,
			createdByUserId: context.user.id,
			...fields,
		});
		logger.info("Admin created poll", {
			event: "admin_poll_created",
			actorUserId: context.user.id,
			organizationId: input.organizationId,
			pollId: poll.id,
		});
		return { ok: true as const, poll };
	});
