import { db, getPollForOrg, upsertPollVote } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { invalidateMemberFeedCache } from "../../circle/lib/member-feed-cache";
import { buildPollCards } from "../lib/build-poll-cards";
import { type PollCardData, resolvePollStatus } from "../lib/poll-view";

export type VotePollResult =
	| { ok: true; poll: PollCardData }
	| { ok: false; reason: "not_found" | "closed" | "invalid_option" | "not_member" };

export const votePoll = protectedProcedure
	.route({
		method: "POST",
		path: "/polls/vote",
		tags: ["Polls"],
		summary: "Cast or change a vote",
	})
	.input(z.object({ organizationId: z.string(), pollId: z.string(), optionId: z.string() }))
	.handler(async ({ input, context: { user } }): Promise<VotePollResult> => {
		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!member) return { ok: false, reason: "not_member" };
		const poll = await getPollForOrg({
			organizationId: input.organizationId,
			pollId: input.pollId,
		});
		if (!poll) return { ok: false, reason: "not_found" };
		const now = new Date();
		if (resolvePollStatus(poll, now) !== "open") return { ok: false, reason: "closed" };
		if (!poll.options.some((o) => o.id === input.optionId)) {
			return { ok: false, reason: "invalid_option" };
		}
		await upsertPollVote({ pollId: poll.id, optionId: input.optionId, userId: user.id });
		// The 60s per-member feed buffer holds the old myVoteOptionId/results.
		invalidateMemberFeedCache(user.id, input.organizationId);
		const [card] = await buildPollCards({ polls: [poll], userId: user.id, now });
		return { ok: true, poll: card };
	});
