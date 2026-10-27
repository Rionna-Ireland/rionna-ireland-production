import type { MemberFeedItem } from "@repo/api/modules/circle/lib/parse-post";
import type { PollCardData } from "@repo/api/modules/polls/lib/poll-view";
import type { QueryClient } from "@tanstack/react-query";

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

/** Sets my vote; `null` clears it (used to undo an optimistic vote). */
export function applyVote(items: Items, pollId: string, optionId: string | null): Items {
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

interface FeedCacheClient {
	cancelQueries: QueryClient["cancelQueries"];
	getQueriesData: QueryClient["getQueriesData"];
	setQueryData: QueryClient["setQueryData"];
}

/** Applies an items transform to every cached feed under `queryKey` (first page, filtered, load-more pages). */
export function patchFeedCaches(
	qc: Pick<FeedCacheClient, "getQueriesData" | "setQueryData">,
	queryKey: readonly unknown[],
	fn: (items: Items) => Items,
) {
	for (const [key, data] of qc.getQueriesData<PagedFeed>({ queryKey })) {
		if (!data || !Array.isArray(data.pages)) continue;
		const next = mapPages(data, fn);
		if (next !== data) qc.setQueryData(key, next);
	}
}

/**
 * Optimistic update for one item: skip while `id` is in flight, patch every cached feed,
 * send, then reconcile with the server answer. On failure only that item is rolled back
 * (via `rollback`), so concurrent updates to other items survive.
 */
export async function optimisticFeedUpdate<R>(opts: {
	qc: FeedCacheClient;
	queryKey: readonly unknown[];
	/** Ids in flight; mutated here. `notify` runs after each change so the UI can re-render. */
	pending: Set<string>;
	notify: () => void;
	id: string;
	apply: (items: Items) => Items;
	rollback: (items: Items) => Items;
	/** Must throw when the server rejects. */
	send: () => Promise<R>;
	reconcile: (result: R) => (items: Items) => Items;
}): Promise<"skipped" | "ok" | "failed"> {
	const { qc, queryKey, pending, id } = opts;
	if (pending.has(id)) return "skipped";
	pending.add(id);
	opts.notify();
	try {
		await qc.cancelQueries({ queryKey });
		patchFeedCaches(qc, queryKey, opts.apply);
		try {
			const result = await opts.send();
			patchFeedCaches(qc, queryKey, opts.reconcile(result));
			return "ok";
		} catch {
			patchFeedCaches(qc, queryKey, opts.rollback);
			return "failed";
		}
	} finally {
		pending.delete(id);
		opts.notify();
	}
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
