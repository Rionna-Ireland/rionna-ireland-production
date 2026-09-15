import { describe, expect, it } from "vitest";

import { dublinDateKey, firstPhotoUrl, INBOX_KINDS, KIND_META, presentInboxItem } from "../kinds";

describe("KIND_META", () => {
	it("covers every kind", () => {
		for (const kind of INBOX_KINDS) expect(KIND_META[kind]).toBeDefined();
	});
	it("bumps the badge on regroup for likes and comments only", () => {
		expect(KIND_META.post_like.bumpOnRegroup).toBe(true);
		expect(KIND_META.post_comment.bumpOnRegroup).toBe(true);
		expect(KIND_META.horse_posts.bumpOnRegroup).toBe(false);
	});
});

describe("presentInboxItem", () => {
	const base = { title: "stored title", body: "stored body", actorName: "Sarah", actorCount: 1 };
	it("renders a single like", () => {
		expect(presentInboxItem({ ...base, kind: "post_like" })).toEqual({ title: "Sarah liked your post", body: "stored body" });
	});
	it("renders grouped likes with singular/plural others", () => {
		expect(presentInboxItem({ ...base, kind: "post_like", actorCount: 2 }).title).toBe("Sarah and 1 other liked your post");
		expect(presentInboxItem({ ...base, kind: "post_like", actorCount: 4 }).title).toBe("Sarah and 3 others liked your post");
	});
	it("renders grouped comments", () => {
		expect(presentInboxItem({ ...base, kind: "post_comment", actorCount: 3 }).title).toBe("Sarah and 2 others commented on your post");
	});
	it("renders horse posts in the body, keeping the stored title", () => {
		expect(presentInboxItem({ ...base, kind: "horse_posts", title: "New posts in Rionna's Dream", actorCount: 3 })).toEqual({
			title: "New posts in Rionna's Dream",
			body: "Sarah and 2 others posted",
		});
		expect(presentInboxItem({ ...base, kind: "horse_posts", title: "t" }).body).toBe("Sarah posted");
	});
	it("falls back to 'Someone' without an actor name", () => {
		expect(presentInboxItem({ ...base, kind: "post_like", actorName: null }).title).toBe("Someone liked your post");
	});
	it("passes other kinds through unchanged", () => {
		expect(presentInboxItem({ ...base, kind: "news" })).toEqual({ title: "stored title", body: "stored body" });
	});
});

describe("dublinDateKey", () => {
	it("uses the Europe/Dublin calendar day", () => {
		// 23:30 UTC on 14 Jul is 00:30 IST on 15 Jul
		expect(dublinDateKey(new Date("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
		expect(dublinDateKey(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-14");
	});
});

describe("firstPhotoUrl", () => {
	it("returns the first photo url or null", () => {
		expect(firstPhotoUrl([{ url: "https://x/1.jpg", caption: "" }])).toBe("https://x/1.jpg");
		expect(firstPhotoUrl([])).toBeNull();
		expect(firstPhotoUrl(null)).toBeNull();
		expect(firstPhotoUrl([{ caption: "no url" }])).toBeNull();
	});
});
