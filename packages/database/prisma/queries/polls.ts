import { db } from "../client";

const pollWithOptions = { options: { orderBy: { sortOrder: "asc" as const } } };

export type PollWithOptions = NonNullable<Awaited<ReturnType<typeof getPollForOrg>>>;

export async function getPollForOrg(args: { organizationId: string; pollId: string }) {
	return db.poll.findFirst({
		where: { id: args.pollId, organizationId: args.organizationId },
		include: pollWithOptions,
	});
}

/**
 * Polls a member may see: published (open or closed) club-scope polls, plus
 * space-scope polls for the given (already follow-filtered) space ids. Closed
 * polls are kept for `closedWithinMs` after closing so results stay visible.
 * Lazy `closesAt` is NOT applied here — callers use `resolvePollStatus`.
 */
export async function getVisiblePolls(args: {
	organizationId: string;
	spaceIds: string[];
	now: Date;
	closedWithinMs: number;
}) {
	const closedSince = new Date(args.now.getTime() - args.closedWithinMs);
	return db.poll.findMany({
		where: {
			organizationId: args.organizationId,
			publishedAt: { not: null },
			OR: [{ status: "open" }, { status: "closed", closedAt: { gte: closedSince } }],
			AND: [
				{
					OR: [
						{ scope: "club" },
						...(args.spaceIds.length > 0
							? [{ scope: "space", circleSpaceId: { in: args.spaceIds } }]
							: []),
					],
				},
			],
		},
		include: pollWithOptions,
		orderBy: { publishedAt: "desc" },
	});
}

export async function getVoteCountRows(pollIds: string[]) {
	if (pollIds.length === 0) return [];
	return db.pollVote.groupBy({
		by: ["pollId", "optionId"],
		where: { pollId: { in: pollIds } },
		_count: { _all: true },
	});
}

export async function getMemberVotes(args: { pollIds: string[]; userId: string }) {
	if (args.pollIds.length === 0) return {} as Record<string, string>;
	const votes = await db.pollVote.findMany({
		where: { pollId: { in: args.pollIds }, userId: args.userId },
		select: { pollId: true, optionId: true },
	});
	return Object.fromEntries(votes.map((v) => [v.pollId, v.optionId])) as Record<string, string>;
}

export async function upsertPollVote(args: { pollId: string; optionId: string; userId: string }) {
	await db.pollVote.upsert({
		where: { pollId_userId: { pollId: args.pollId, userId: args.userId } },
		create: args,
		update: { optionId: args.optionId },
	});
}

export async function claimPollNotification(id: string): Promise<boolean> {
	const result = await db.poll.updateMany({
		where: { id, notifiedAt: null },
		data: { notifiedAt: new Date() },
	});
	return result.count === 1;
}

/** Release a claim taken by `claimPollNotification` so a re-publish can retry. */
export async function releasePollNotification(id: string): Promise<void> {
	await db.poll.updateMany({ where: { id }, data: { notifiedAt: null } });
}

// ---- admin ----

export async function createPoll(args: {
	organizationId: string;
	createdByUserId: string;
	question: string;
	scope: "club" | "space";
	circleSpaceId: string | null;
	closesAt: Date | null;
	options: string[];
}) {
	return db.poll.create({
		data: {
			organizationId: args.organizationId,
			createdByUserId: args.createdByUserId,
			question: args.question,
			scope: args.scope,
			circleSpaceId: args.circleSpaceId,
			closesAt: args.closesAt,
			options: { create: args.options.map((label, sortOrder) => ({ label, sortOrder })) },
		},
		include: pollWithOptions,
	});
}

/** Drafts only: replaces the option set wholesale (no votes exist yet). */
export async function updatePollDraft(args: {
	organizationId: string;
	pollId: string;
	question: string;
	scope: "club" | "space";
	circleSpaceId: string | null;
	closesAt: Date | null;
	options: string[];
}) {
	return db.$transaction(async (tx) => {
		const updated = await tx.poll.updateMany({
			where: { id: args.pollId, organizationId: args.organizationId, status: "draft" },
			data: {
				question: args.question,
				scope: args.scope,
				circleSpaceId: args.circleSpaceId,
				closesAt: args.closesAt,
			},
		});
		if (updated.count !== 1) return null;
		await tx.pollOption.deleteMany({ where: { pollId: args.pollId } });
		await tx.pollOption.createMany({
			data: args.options.map((label, sortOrder) => ({
				pollId: args.pollId,
				label,
				sortOrder,
			})),
		});
		return tx.poll.findUnique({ where: { id: args.pollId }, include: pollWithOptions });
	});
}

export async function listPolls(args: {
	organizationId: string;
	status?: "draft" | "open" | "closed";
	limit: number;
	offset: number;
}) {
	const where = {
		organizationId: args.organizationId,
		...(args.status ? { status: args.status } : {}),
	};
	const [polls, total] = await Promise.all([
		db.poll.findMany({
			where,
			include: { ...pollWithOptions, _count: { select: { votes: true } } },
			orderBy: [{ status: "asc" }, { createdAt: "desc" }],
			take: args.limit,
			skip: args.offset,
		}),
		db.poll.count({ where }),
	]);
	return { polls, total };
}

/** Publish (draft → open) or close (open → closed). Returns false if the row wasn't in `from`. */
export async function setPollStatus(args: {
	organizationId: string;
	pollId: string;
	from: "draft" | "open";
	to: "open" | "closed";
	now: Date;
}): Promise<boolean> {
	const result = await db.poll.updateMany({
		where: { id: args.pollId, organizationId: args.organizationId, status: args.from },
		data:
			args.to === "open"
				? { status: "open", publishedAt: args.now }
				: { status: "closed", closedAt: args.now },
	});
	return result.count === 1;
}

export async function listPollVoters(args: { organizationId: string; pollId: string }) {
	return db.pollVote.findMany({
		where: { pollId: args.pollId, poll: { organizationId: args.organizationId } },
		select: {
			optionId: true,
			updatedAt: true,
			user: { select: { id: true, name: true, email: true } },
		},
		orderBy: { updatedAt: "desc" },
	});
}
