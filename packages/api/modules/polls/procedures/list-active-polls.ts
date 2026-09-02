import { db, getVisiblePolls, parseOrgMetadata } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { buildPollCards } from "../lib/build-poll-cards";
import type { PollCardData } from "../lib/poll-view";

export const CLOSED_POLL_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ActivePollsResult {
	ok: boolean;
	polls: PollCardData[];
}

/** Club-scope polls for Home + the deep-link route. Space-scope polls ride the feed (get-member-feed). */
export const listActivePolls = protectedProcedure
	.route({ method: "GET", path: "/polls/active", tags: ["Polls"], summary: "Active club polls" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }): Promise<ActivePollsResult> => {
		const empty: ActivePollsResult = { ok: true, polls: [] };
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org || parseOrgMetadata(org.metadata).features?.polls === false) return empty;
		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!member) return empty;
		const now = new Date();
		const polls = await getVisiblePolls({
			organizationId: input.organizationId,
			spaceIds: [],
			now,
			closedWithinMs: CLOSED_POLL_VISIBLE_MS,
		});
		return { ok: true, polls: await buildPollCards({ polls, userId: user.id, now }) };
	});
