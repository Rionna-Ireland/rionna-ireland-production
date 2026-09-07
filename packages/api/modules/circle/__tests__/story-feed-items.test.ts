import { describe, expect, it, vi } from "vitest";

const { mockGetPublished } = vi.hoisted(() => ({ mockGetPublished: vi.fn() }));

vi.mock("@repo/database", () => ({ getPublishedNewsPosts: mockGetPublished }));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { getStoryFeedItems, toStoryFeedItem } from "../lib/story-feed-items";

const ROW = {
	id: "n1",
	slug: "galway-recap",
	title: "Galway recap",
	subtitle: "Three winners",
	featuredImageUrl: "https://x/y.jpg",
	category: null,
	publishedAt: new Date("2026-09-01T10:00:00Z"),
	author: { id: "u", name: "Emma", image: null },
};

describe("toStoryFeedItem", () => {
	it("maps a news row to a story feed item", () => {
		expect(toStoryFeedItem(ROW)).toEqual({
			id: "story:n1",
			kind: "story",
			story: { slug: "galway-recap", category: null },
			spaceId: null,
			spaceName: "News",
			title: "Galway recap",
			excerpt: "Three winners",
			imageUrl: "https://x/y.jpg",
			createdAt: "2026-09-01T10:00:00.000Z",
			authorName: "Emma",
			commentCount: 0,
			likeCount: 0,
			isLiked: false,
			url: null,
		});
	});

	it("labels charity stories", () =>
		expect(toStoryFeedItem({ ...ROW, category: "charity" }).spaceName).toBe("Charity"));
});

describe("getStoryFeedItems", () => {
	it("drops rows older than the window and caps the count", async () => {
		const now = new Date("2026-09-03T00:00:00Z");
		mockGetPublished.mockResolvedValue([
			ROW,
			{ ...ROW, id: "old", publishedAt: new Date("2026-07-01T00:00:00Z") },
		]);
		const items = await getStoryFeedItems({ organizationId: "org1", now });
		expect(items.map((i) => i.id)).toEqual(["story:n1"]);
		expect(mockGetPublished).toHaveBeenCalledWith({ organizationId: "org1", limit: 20 });
	});
});
