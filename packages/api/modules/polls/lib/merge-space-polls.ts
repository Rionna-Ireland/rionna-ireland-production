import { getVisiblePolls } from "@repo/database";

import type { MemberFeedItem } from "../../circle/lib/parse-post";
import { buildPollCards } from "./build-poll-cards";
import { CLOSED_POLL_VISIBLE_MS } from "./poll-view";
import { toPollFeedItem } from "./to-feed-item";

/**
 * Space-scope poll cards for a single horse discussion space, newest
 * `publishedAt` first. `getVisiblePolls` also returns club-scope polls (it
 * doesn't distinguish scopes), so callers must NOT feed those into the
 * merged/club feed a second time — hence the explicit scope + circleSpaceId
 * filter here rather than trusting the raw result.
 */
export async function getSpacePollFeedItems(args: {
	organizationId: string;
	spaceId: string;
	userId: string;
	now: Date;
}): Promise<MemberFeedItem[]> {
	const pollRows = await getVisiblePolls({
		organizationId: args.organizationId,
		spaceIds: [args.spaceId],
		now: args.now,
		closedWithinMs: CLOSED_POLL_VISIBLE_MS,
	});
	const spaceScoped = pollRows.filter(
		(poll) => poll.scope === "space" && poll.circleSpaceId === args.spaceId,
	);
	if (spaceScoped.length === 0) return [];
	const cards = await buildPollCards({ polls: spaceScoped, userId: args.userId, now: args.now });
	cards.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
	return cards.map(toPollFeedItem);
}
