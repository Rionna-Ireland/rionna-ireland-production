interface FeedPageItem {
	id: string;
	spaceId?: string | null;
}

/** React key and dedupe key for a feed card (same id in different spaces is distinct). */
export function feedItemKey(item: FeedPageItem): string {
	return `${item.spaceId}-${item.id}`;
}
