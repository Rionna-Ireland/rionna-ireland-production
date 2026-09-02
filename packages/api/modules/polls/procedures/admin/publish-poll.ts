import { db, getPollForOrg, setPollStatus } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { notifyPollPublished } from "../../lib/notify-poll-published";

export const publishPoll = adminProcedure
	.route({
		method: "POST",
		path: "/admin/polls/{pollId}/publish",
		tags: ["Polls"],
		summary: "Publish a poll",
	})
	.input(
		z.object({
			organizationId: z.string(),
			pollId: z.string(),
			notifyMembers: z.boolean().default(true),
		}),
	)
	.handler(async ({ input, context }) => {
		const poll = await getPollForOrg(input);
		if (!poll) return { ok: false as const, reason: "not_draft" as const };
		const flipped = await setPollStatus({
			...input,
			from: "draft",
			to: "open",
			now: new Date(),
		});
		if (!flipped) return { ok: false as const, reason: "not_draft" as const };
		logger.info("Admin published poll", {
			event: "admin_poll_published",
			actorUserId: context.user.id,
			organizationId: input.organizationId,
			pollId: input.pollId,
			notifyMembers: input.notifyMembers,
		});
		if (input.notifyMembers) {
			if (poll.scope === "space") {
				const horse = await db.horse.findFirst({
					where: {
						organizationId: input.organizationId,
						circleSpaceId: poll.circleSpaceId,
					},
					select: { id: true },
				});
				await notifyPollPublished({
					organizationId: input.organizationId,
					pollId: input.pollId,
					question: poll.question,
					scope: "space",
					followersOfHorseId: horse?.id,
				});
			} else {
				await notifyPollPublished({
					organizationId: input.organizationId,
					pollId: input.pollId,
					question: poll.question,
					scope: "club",
				});
			}
		}
		return { ok: true as const };
	});
