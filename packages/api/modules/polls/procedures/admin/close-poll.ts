import { setPollStatus } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const closePoll = adminProcedure
	.route({
		method: "POST",
		path: "/admin/polls/{pollId}/close",
		tags: ["Polls"],
		summary: "Close a poll",
	})
	.input(z.object({ organizationId: z.string(), pollId: z.string() }))
	.handler(async ({ input, context }) => {
		const flipped = await setPollStatus({
			...input,
			from: "open",
			to: "closed",
			now: new Date(),
		});
		if (!flipped) return { ok: false as const, reason: "not_open" as const };
		logger.info("Admin closed poll", {
			event: "admin_poll_closed",
			actorUserId: context.user.id,
			organizationId: input.organizationId,
			pollId: input.pollId,
		});
		return { ok: true as const };
	});
