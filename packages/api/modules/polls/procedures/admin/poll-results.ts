import { getPollForOrg, getVoteCountRows, listPollVoters } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { resolvePollStatus } from "../../lib/poll-view";
import { groupVoteCounts } from "../../lib/vote-counts";

/** Admin always sees counts + who voted (S9-04: anonymous to members, attributed to admin). */
export const pollResults = adminProcedure
	.route({
		method: "GET",
		path: "/admin/polls/{pollId}/results",
		tags: ["Polls"],
		summary: "Poll results",
	})
	.input(z.object({ organizationId: z.string(), pollId: z.string() }))
	.handler(async ({ input }) => {
		const poll = await getPollForOrg(input);
		if (!poll) return { ok: false as const, reason: "not_found" as const };
		const [rows, voters] = await Promise.all([
			getVoteCountRows([poll.id]),
			listPollVoters(input),
		]);
		const byOption = groupVoteCounts(rows)[poll.id] ?? {};
		const total = Object.values(byOption).reduce((a, b) => a + b, 0);
		return {
			ok: true as const,
			poll,
			status: resolvePollStatus(poll, new Date()),
			total,
			byOption,
			voters: voters.map((v) => ({ ...v.user, optionId: v.optionId, votedAt: v.updatedAt })),
		};
	});
