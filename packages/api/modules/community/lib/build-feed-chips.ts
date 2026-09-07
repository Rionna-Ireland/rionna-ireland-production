import type { OrganizationMetadata } from "@repo/database";

import { POST_SPACE_TYPES } from "../../circle/lib/space-types";
import { isHorseSpace } from "./space-settings";
import type { FeedChip, MemberSpace } from "./types";

/**
 * Derive the Community tab's filter chips from a member's Circle spaces
 * (S12-02b). Order: all, horses (omitted when the member is in no horse
 * space), news, charity, polls, then one `space` chip per non-horse
 * post-type space the member is a member of, in listing order, minus
 * admin-hidden chips.
 *
 * Horse detection: a space counts as a horse space when its id is in
 * `horseSpaceIds` (backed by `Horse.circleSpaceId`, the source of truth) OR
 * `isHorseSpace(metadata, space)` matches on `spaceGroupId` — a QA finding
 * showed the admin-listed group id can drift from
 * `metadata.circle.spaceGroupId`, so the space-group check alone isn't
 * reliable.
 */
export function buildFeedChips(p: {
	spaces: MemberSpace[];
	metadata: OrganizationMetadata;
	horseSpaceIds: Set<string>;
}): FeedChip[] {
	const { spaces, metadata, horseSpaceIds } = p;
	const newsEnabled = metadata.features?.news !== false;
	const pollsEnabled = metadata.features?.polls !== false;

	const memberSpaces = spaces.filter((s) => s.isMember);
	const isHorse = (s: MemberSpace) => horseSpaceIds.has(s.id) || isHorseSpace(metadata, s);

	const horseIds = memberSpaces.filter(isHorse).map((s) => s.id);

	const chips: FeedChip[] = [{ id: "all", kind: "all", label: "All", spaceIds: [] }];
	if (horseIds.length > 0) {
		chips.push({ id: "horses", kind: "horses", label: "Horses", spaceIds: horseIds });
	}
	if (newsEnabled) {
		chips.push({ id: "news", kind: "news", label: "News", spaceIds: [] });
		chips.push({ id: "charity", kind: "charity", label: "Charity", spaceIds: [] });
	}
	if (pollsEnabled) {
		chips.push({ id: "polls", kind: "polls", label: "Polls", spaceIds: [] });
	}

	for (const space of memberSpaces) {
		if (isHorse(space)) continue;
		if (!space.spaceType || !POST_SPACE_TYPES.has(space.spaceType)) continue;
		if (metadata.circle?.spaces?.[space.id]?.hideChip) continue;
		chips.push({ id: `space:${space.id}`, kind: "space", label: space.name, spaceIds: [] });
	}

	return chips;
}
