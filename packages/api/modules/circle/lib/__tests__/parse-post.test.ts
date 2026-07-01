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
	it("prefers real body.html and carries author/space/date", () => {
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

	it("nulls the 'Update available' placeholder body.html and keeps the real plain text", () => {
		// This is what the headless API actually returns for most posts.
		const placeholderPost = {
			id: 34087789,
			name: "Video",
			body: { html: "<div><strong>Update available</strong><br>Please update the app to view this post.</div>" },
			body_plain_text: "This is the video ^",
			space: { id: 2711304, name: "My Boy Harry", slug: "my-boy-harry" },
			cardview_image: "https://img/thumb.jpg",
			created_at: "2026-07-01T10:00:00.000Z",
		};
		const post = toPostDetail(placeholderPost, {});
		expect(post.bodyHtml).toBeNull();
		expect(post.bodyText).toBe("This is the video ^");
		expect(post.imageUrl).toBe("https://img/thumb.jpg");
	});

	it("exposes the tiptap doc + embed map for rich rendering", () => {
		const videoPost = {
			id: 34087789,
			name: "Video",
			body: { html: "<div><strong>Update available</strong></div>" },
			tiptap_body: {
				body: {
					type: "doc",
					content: [
						{ type: "embed", attrs: { sgid: "sg1" } },
						{ type: "paragraph", content: [{ type: "text", text: "This is the video ^" }] },
					],
				},
				sgids_to_object_map: { sg1: { embed_type: "video", html: "<iframe></iframe>" } },
			},
		};
		const post = toPostDetail(videoPost, {});
		expect((post.tiptapDoc as { content: unknown[] }).content).toHaveLength(2);
		expect(post.embeds).toMatchObject({ sg1: { embed_type: "video" } });
	});
});
