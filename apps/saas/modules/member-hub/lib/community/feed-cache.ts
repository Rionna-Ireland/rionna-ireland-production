import type { MemberFeedItem } from "@repo/api/modules/circle/lib/parse-post";
import type { PollCardData } from "@repo/api/modules/polls/lib/poll-view";

/** Pure cache transforms ported from the mobile app; each returns the same reference when nothing changes. */

type Items = MemberFeedItem[];

export function applyLike(items: Items, postId: string, liked: boolean): Items {
	if (!items.some((i) => i.id === postId && i.isLiked !== liked)) return items;
	return items.map((i) =>
		i.id === postId && i.isLiked !== liked
			? { ...i, isLiked: liked, likeCount: Math.max(0, i.likeCount + (liked ? 1 : -1)) }
			: i,
	);
}

/** Writes the server's authoritative like state over the optimistic guess. */
export function reconcileLike(
	items: Items,
	postId: string,
	liked: boolean,
	likeCount: number | null,
): Items {
	if (likeCount === null) return items;
	if (!items.some((i) => i.id === postId && (i.isLiked !== liked || i.likeCount !== likeCount)))
		return items;
	return items.map((i) => (i.id === postId ? { ...i, isLiked: liked, likeCount } : i));
}

export function applyVote(items: Items, pollId: string, optionId: string): Items {
	let changed = false;
	const next = items.map((i) => {
		if (i.kind !== "poll" || i.poll?.id !== pollId || i.poll.myVoteOptionId === optionId)
			return i;
		changed = true;
		return { ...i, poll: { ...i.poll, myVoteOptionId: optionId } };
	});
	return changed ? next : items;
}

export function reconcilePoll(items: Items, server: PollCardData): Items {
	let changed = false;
	const next = items.map((i) => {
		if (i.kind !== "poll" || i.poll?.id !== server.id || i.poll === server) return i;
		changed = true;
		return { ...i, poll: server };
	});
	return changed ? next : items;
}

interface PagedFeed {
	pages: { items: Items }[];
}

/** Applies an items transform to every page of an infinite query's data. */
export function mapPages<T extends PagedFeed>(data: T, fn: (items: Items) => Items): T {
	let changed = false;
	const pages = data.pages.map((page) => {
		const items = fn(page.items);
		if (items === page.items) return page;
		changed = true;
		return { ...page, items };
	});
	return changed ? { ...data, pages } : data;
}

/** Integer percentages that sum to exactly 100, or all 0 when there are no votes. */
export function percentagesFor(
	options: { id: string }[],
	results: { total: number; byOption: Record<string, number> },
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const o of options) out[o.id] = 0;
	const counted = options.reduce((sum, o) => sum + (results.byOption[o.id] ?? 0), 0);
	if (results.total === 0 || counted === 0) return out;

	const exact = options.map((o) => ((results.byOption[o.id] ?? 0) / counted) * 100);
	const floors = exact.map(Math.floor);
	let remainder = 100 - floors.reduce((s, p) => s + p, 0);
	const order = exact
		.map((p, index) => ({ index, fractional: p - (floors[index] as number) }))
		.sort((a, b) => b.fractional - a.fractional || a.index - b.index);
	for (const { index } of order) {
		if (remainder <= 0) break;
		floors[index] = (floors[index] as number) + 1;
		remainder -= 1;
	}
	options.forEach((o, index) => {
		out[o.id] = floors[index] as number;
	});
	return out;
}
