export type PollScope = "club" | "space";
export type PollStatus = "draft" | "open" | "closed";

export interface PollOptionView {
	id: string;
	label: string;
	sortOrder: number;
}

export interface PollResults {
	total: number;
	byOption: Record<string, number>;
}

export interface PollCardData {
	id: string;
	question: string;
	scope: PollScope;
	circleSpaceId: string | null;
	status: "open" | "closed";
	publishedAt: string;
	closesAt: string | null;
	options: PollOptionView[];
	myVoteOptionId: string | null;
	results: PollResults | null;
}

/** The subset of the Prisma `Poll` (+ options) the view helpers need. */
export interface PollRecord {
	id: string;
	organizationId: string;
	question: string;
	scope: string;
	circleSpaceId: string | null;
	status: string;
	publishedAt: Date | null;
	closesAt: Date | null;
	options: PollOptionView[];
}

/** Lazy auto-close: an open poll whose closesAt has passed reads as closed. */
export function resolvePollStatus(
	poll: Pick<PollRecord, "status" | "closesAt">,
	now: Date,
): PollStatus {
	if (poll.status === "open" && poll.closesAt && poll.closesAt.getTime() <= now.getTime()) {
		return "closed";
	}
	if (poll.status === "draft" || poll.status === "closed") return poll.status;
	return "open";
}

export function isResultsVisible(status: PollStatus, myVoteOptionId: string | null): boolean {
	return status === "closed" || myVoteOptionId !== null;
}

export function toPollCardData(args: {
	poll: PollRecord;
	voteCounts: Record<string, number>;
	myVoteOptionId: string | null;
	now: Date;
}): PollCardData {
	const { poll, voteCounts, myVoteOptionId, now } = args;
	const status = resolvePollStatus(poll, now);
	const options = [...poll.options].sort((a, b) => a.sortOrder - b.sortOrder);
	const byOption: Record<string, number> = {};
	let total = 0;
	for (const option of options) {
		const count = voteCounts[option.id] ?? 0;
		byOption[option.id] = count;
		total += count;
	}
	return {
		id: poll.id,
		question: poll.question,
		scope: poll.scope === "space" ? "space" : "club",
		circleSpaceId: poll.circleSpaceId,
		status: status === "closed" ? "closed" : "open",
		publishedAt: (poll.publishedAt ?? new Date(0)).toISOString(),
		closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
		options: options.map(({ id, label, sortOrder }) => ({ id, label, sortOrder })),
		myVoteOptionId,
		results: isResultsVisible(status, myVoteOptionId) ? { total, byOption } : null,
	};
}
