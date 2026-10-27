import type { MemberFeedItem } from "@repo/api/modules/circle/lib/parse-post";
import type { FeedChip } from "@repo/api/modules/community/lib/types";

/** getMemberFeed filter inputs a chip maps to (S12-02b). */
export interface FeedFilterParams {
	filterKind?: "poll" | "story";
	filterCategory?: "charity";
	filterSpaceIds?: string[];
}

export function chipToFilter(chip: FeedChip | undefined): FeedFilterParams {
	switch (chip?.kind) {
		case "horses":
		case "space":
			return { filterSpaceIds: chip.spaceIds };
		case "news":
			return { filterKind: "story" };
		case "charity":
			return { filterKind: "story", filterCategory: "charity" };
		case "polls":
			return { filterKind: "poll" };
		default:
			return {};
	}
}

/** Which empty-state copy a chip uses; the component maps this to i18n keys. */
export function emptyKindForChip(
	chip: FeedChip | undefined,
): "default" | "space" | "horses" | "polls" | "stories" {
	switch (chip?.kind) {
		case "space":
			return "space";
		case "horses":
			return "horses";
		case "polls":
			return "polls";
		case "news":
		case "charity":
			return "stories";
		default:
			return "default";
	}
}

export const MAX_ANNOUNCEMENTS = 5;

const ANNOUNCEMENT_SPACE_NAME = /\bannouncements?\b/i;

export function announcementSpaceIdsFromChips(chips: FeedChip[]): string[] {
	return chips
		.filter((chip) => chip.kind === "space" && ANNOUNCEMENT_SPACE_NAME.test(chip.label))
		.flatMap((chip) => chip.spaceIds);
}

function isAnnouncementItem(item: MemberFeedItem, ids: Set<string>): boolean {
	// The backend flag wins; the heuristic only covers payloads without it.
	if (typeof item.isAnnouncement === "boolean") return item.isAnnouncement;
	return (
		(item.spaceId !== null && ids.has(item.spaceId)) ||
		(item.spaceName !== null && ANNOUNCEMENT_SPACE_NAME.test(item.spaceName))
	);
}

/** Posts for the announcement cards: openable posts only, newest first. */
export function selectAnnouncements(
	items: MemberFeedItem[] | undefined,
	announcementSpaceIds: string[] = [],
	limit = MAX_ANNOUNCEMENTS,
): MemberFeedItem[] {
	if (!items) return [];
	const ids = new Set(announcementSpaceIds);
	return items
		.filter((item) => item.kind === "post" && item.spaceId !== null)
		.filter((item) => isAnnouncementItem(item, ids))
		.sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0))
		.slice(0, limit);
}

/** Roving-focus target for a radiogroup key press (wraps at the ends); null for keys that don't move. */
export function nextChipIndex(key: string, index: number, length: number): number | null {
	const target =
		key === "Home"
			? 0
			: key === "End"
				? length - 1
				: key === "ArrowRight" || key === "ArrowDown"
					? index + 1
					: key === "ArrowLeft" || key === "ArrowUp"
						? index - 1
						: null;
	return target === null ? null : (target + length) % length;
}
