import type { MemberFeedItem } from "./parse-post";

export interface FeedFilterInput {
	kind?: "poll" | "story";
	category?: "charity";
	spaceIds?: string[];
	/** S13-18: the Charity chip also covers posts from this space (server-injected, never client input). */
	charitySpaceId?: string;
}

/**
 * Apply the S12-02b feed filter to a member feed buffer before it is sliced
 * into a page (see `paginate` in `get-member-feed.ts`).
 *
 * Returns the same array reference when there is nothing to filter (no
 * filter, or an empty `spaceIds` with no `kind`) — callers/tests rely on
 * this to avoid an unnecessary copy on the common unfiltered path.
 */
export function applyFeedFilter(
	items: MemberFeedItem[],
	filter: FeedFilterInput | undefined,
): MemberFeedItem[] {
	if (!filter) return items;
	const spaces = filter.spaceIds && filter.spaceIds.length > 0 ? new Set(filter.spaceIds) : null;
	if (!filter.kind && !spaces) return items;
	return items.filter((item) => {
		if (
			filter.kind === "story" &&
			filter.category === "charity" &&
			filter.charitySpaceId &&
			item.spaceId === filter.charitySpaceId
		) {
			return true;
		}
		if (filter.kind && item.kind !== filter.kind) return false;
		if (filter.kind === "story" && filter.category && item.story?.category !== filter.category) {
			return false;
		}
		if (spaces && (!item.spaceId || !spaces.has(item.spaceId))) return false;
		return true;
	});
}
