import type { MemberFeedItem } from "../../circle/lib/parse-post";
import type { PollCardData } from "./poll-view";

/** Poll cards ride the member feed as their own item kind; `poll:` prefix avoids Circle id collisions. */
export function toPollFeedItem(card: PollCardData): MemberFeedItem {
	return {
		id: `poll:${card.id}`,
		spaceId: card.circleSpaceId,
		kind: "poll",
		title: card.question,
		excerpt: null,
		createdAt: card.publishedAt,
		spaceName: null,
		authorName: null,
		commentCount: 0,
		likeCount: 0,
		isLiked: false,
		imageUrl: null,
		url: null,
		poll: card,
	};
}
