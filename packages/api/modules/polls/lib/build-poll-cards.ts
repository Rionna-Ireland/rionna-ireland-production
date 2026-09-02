import { getMemberVotes, getVoteCountRows } from "@repo/database";

import { type PollCardData, type PollRecord, toPollCardData } from "./poll-view";
import { groupVoteCounts } from "./vote-counts";

/** Turns visible poll rows into member-facing cards (counts + the member's vote). */
export async function buildPollCards(args: {
	polls: PollRecord[];
	userId: string;
	now: Date;
}): Promise<PollCardData[]> {
	const pollIds = args.polls.map((p) => p.id);
	const [countRows, myVotes] = await Promise.all([
		getVoteCountRows(pollIds),
		getMemberVotes({ pollIds, userId: args.userId }),
	]);
	const counts = groupVoteCounts(countRows);
	return args.polls.map((poll) =>
		toPollCardData({
			poll,
			voteCounts: counts[poll.id] ?? {},
			myVoteOptionId: myVotes[poll.id] ?? null,
			now: args.now,
		}),
	);
}
