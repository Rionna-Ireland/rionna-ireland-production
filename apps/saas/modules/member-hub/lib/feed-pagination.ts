/**
 * Load-more pagination logic for the member feed, extracted from
 * CircleFeedList for testability (FABLE_AUDIT C7/C8).
 */

interface FeedPageItem {
	id: string;
	spaceId?: string | null;
}

export interface FeedPageResult<T extends FeedPageItem> {
	ok: boolean;
	items: T[];
	page: number;
	hasNextPage: boolean;
}

export interface LoadMoreState<T extends FeedPageItem> {
	extraItems: T[];
	page: number;
	hasNextPage: boolean;
	loadFailed: boolean;
}

/** Matches the React key CircleFeedList renders cards with. */
export function feedItemKey(item: FeedPageItem): string {
	return `${item.spaceId}-${item.id}`;
}

/**
 * Fold a load-more response into the pagination state.
 *
 * On `ok:false` (the server's fail-safe for transient Circle errors) the
 * page/hasNextPage are kept so the member can retry the same page, and the
 * failure is surfaced via `loadFailed`. On success, incoming items already
 * visible (page-1 items or previously appended ones) are dropped so a post
 * that shifted across page boundaries between fetches can't render twice.
 */
export function applyLoadMoreResult<T extends FeedPageItem>(
	state: LoadMoreState<T>,
	visibleItems: T[],
	result: FeedPageResult<T>,
): LoadMoreState<T> {
	if (!result.ok) {
		return { ...state, loadFailed: true };
	}

	const seen = new Set([...visibleItems, ...state.extraItems].map(feedItemKey));
	const fresh = result.items.filter((item) => !seen.has(feedItemKey(item)));

	return {
		extraItems: [...state.extraItems, ...fresh],
		page: result.page,
		hasNextPage: result.hasNextPage,
		loadFailed: false,
	};
}
