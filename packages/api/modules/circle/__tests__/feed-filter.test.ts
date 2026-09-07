import { describe, expect, it } from "vitest";

import { applyFeedFilter } from "../lib/feed-filter";

const item = (id: string, kind: "post" | "news" | "poll", spaceId: string | null) =>
	({
		id,
		kind,
		spaceId,
		title: id,
		excerpt: null,
		createdAt: null,
		spaceName: null,
		authorName: null,
		commentCount: 0,
		likeCount: 0,
		isLiked: false,
		imageUrl: null,
		url: null,
	}) as const;
const story = (id: string, category: "charity" | null) => ({
	...item(id, "story" as never, null),
	kind: "story" as const,
	story: { slug: id, category },
});
const ITEMS = [
	item("a", "post", "1"),
	item("b", "news", "2"),
	item("c", "poll", null),
	item("d", "poll", "1"),
	story("s1", null),
	story("s2", "charity"),
];

describe("applyFeedFilter", () => {
	it("returns the same array when no filter", () => expect(applyFeedFilter(ITEMS, undefined)).toBe(ITEMS));
	it("keeps only polls for kind=poll", () =>
		expect(applyFeedFilter(ITEMS, { kind: "poll" }).map((i) => i.id)).toEqual(["c", "d"]));
	it("keeps items in the given spaces (posts and space-scoped polls), dropping club-wide polls", () =>
		expect(applyFeedFilter(ITEMS, { spaceIds: ["1"] }).map((i) => i.id)).toEqual(["a", "d"]));
	it("empty spaceIds means no filter", () =>
		expect(applyFeedFilter(ITEMS, { spaceIds: [] })).toBe(ITEMS));
	it("kind=story returns all stories; category=charity narrows to charity stories", () => {
		expect(applyFeedFilter(ITEMS, { kind: "story" }).map((i) => i.id)).toEqual(["s1", "s2"]);
		expect(applyFeedFilter(ITEMS, { kind: "story", category: "charity" }).map((i) => i.id)).toEqual([
			"s2",
		]);
	});
});
