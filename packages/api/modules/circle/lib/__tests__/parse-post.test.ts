import { describe, expect, it } from "vitest";

import { extractPosts, toFeedItem, toPostDetail } from "../parse-post";

const REAL_POST = {
	id: 34130292,
	name: "Test Laska",
	display_title: "Test Laska",
	slug: "test-laska",
	post_type: "basic",
	body: { html: "<p>Hello from <strong>Laska</strong></p>", attachments: {} },
	body_plain_text: "Hello from Laska",
	tiptap_body: { body: { type: "doc", content: [] } },
	author: { id: 1, name: "Jane Trainer", avatar_url: "https://img/a.png" },
	space: { id: 2713068, name: "Laska", slug: "laska", emoji: "🐎" },
	created_at: "2026-07-01T09:00:00.000Z",
	url: "https://community.rionna.com/c/laska/test-laska",
	comment_count: 3,
	user_likes_count: 5,
};

describe("extractPosts", () => {
	it("reads the /home records envelope", () => {
		expect(extractPosts({ records: [REAL_POST] })).toHaveLength(1);
	});
	it("returns [] for junk", () => {
		expect(extractPosts(null)).toEqual([]);
		expect(extractPosts({})).toEqual([]);
	});
});

describe("toFeedItem", () => {
	it("maps a real record to a feed item with spaceId", () => {
		const item = toFeedItem(REAL_POST, { communityDomain: "community.rionna.com" });
		expect(item).toMatchObject({
			id: "34130292",
			spaceId: "2713068",
			title: "Test Laska",
			excerpt: "Hello from Laska",
			spaceName: "Laska",
			authorName: "Jane Trainer",
			commentCount: 3,
			likeCount: 5,
			url: "https://community.rionna.com/c/laska/test-laska",
		});
	});
});

describe("toPostDetail", () => {
	it("prefers body.html and carries author/space/date", () => {
		const post = toPostDetail(REAL_POST, { communityDomain: "community.rionna.com" });
		expect(post).toMatchObject({
			id: "34130292",
			spaceId: "2713068",
			title: "Test Laska",
			bodyHtml: "<p>Hello from <strong>Laska</strong></p>",
			authorName: "Jane Trainer",
			authorAvatarUrl: "https://img/a.png",
			spaceName: "Laska",
			createdAt: "2026-07-01T09:00:00.000Z",
		});
	});
});
