import { describe, expect, it } from "vitest";

import type { PollCardData } from "../poll-view";
import { toPollFeedItem } from "../to-feed-item";

const CARD: PollCardData = {
	id: "p1",
	question: "Which charity next?",
	scope: "club",
	circleSpaceId: null,
	status: "open",
	publishedAt: "2026-09-01T09:00:00.000Z",
	closesAt: null,
	options: [{ id: "o1", label: "A", sortOrder: 0 }],
	myVoteOptionId: null,
	results: null,
};

describe("toPollFeedItem", () => {
	it("wraps a poll card as a kind:poll feed item with a collision-proof id", () => {
		const item = toPollFeedItem(CARD);
		expect(item).toMatchObject({
			id: "poll:p1",
			kind: "poll",
			title: "Which charity next?",
			createdAt: "2026-09-01T09:00:00.000Z",
			spaceId: null,
			commentCount: 0,
			likeCount: 0,
			isLiked: false,
			imageUrl: null,
			url: null,
			poll: CARD,
		});
	});
	it("carries the circle space id for space-scope polls", () => {
		expect(toPollFeedItem({ ...CARD, scope: "space", circleSpaceId: "sp1" }).spaceId).toBe(
			"sp1",
		);
	});
});
