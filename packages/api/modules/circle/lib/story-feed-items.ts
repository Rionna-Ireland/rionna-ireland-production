import { getPublishedNewsPosts } from "@repo/database";

import type { MemberFeedItem } from "./parse-post";

/** How far back a published story stays eligible for the merged feed. */
export const STORY_WINDOW_DAYS = 30;
/** Max stories merged into the feed per load. */
export const STORY_CAP = 20;

/** The subset of a `getPublishedNewsPosts` row that `toStoryFeedItem` needs. */
export interface PublishedStoryRow {
	id: string;
	slug: string;
	title: string;
	subtitle: string | null;
	featuredImageUrl: string | null;
	category: string | null;
	publishedAt: Date | null;
	author: { name: string | null } | null;
}

/** Our `NewsPost` rows ride the member feed as their own item kind; `story:` prefix avoids Circle id collisions. */
export function toStoryFeedItem(row: PublishedStoryRow): MemberFeedItem {
	return {
		id: `story:${row.id}`,
		kind: "story",
		story: { slug: row.slug, category: row.category as "charity" | null },
		spaceId: null,
		spaceName: row.category === "charity" ? "Charity" : "News",
		title: row.title,
		excerpt: row.subtitle,
		imageUrl: row.featuredImageUrl,
		createdAt: row.publishedAt ? row.publishedAt.toISOString() : null,
		authorName: row.author?.name ?? null,
		commentCount: 0,
		likeCount: 0,
		isLiked: false,
		url: null,
	};
}

export async function getStoryFeedItems({
	organizationId,
	now,
}: {
	organizationId: string;
	now: Date;
}): Promise<MemberFeedItem[]> {
	const rows = await getPublishedNewsPosts({ organizationId, limit: STORY_CAP });
	const windowStart = now.getTime() - STORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
	return rows
		.filter((row) => row.publishedAt !== null && row.publishedAt.getTime() >= windowStart)
		.slice(0, STORY_CAP)
		.map(toStoryFeedItem);
}
