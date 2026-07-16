/**
 * Load-more pagination logic for the member feed (FABLE_AUDIT C7/C8).
 *
 * - A failed page load (ok:false — the server's fail-safe for transient
 *   Circle errors) must NOT kill pagination: keep page/hasNextPage so the
 *   member can retry, and surface the failure.
 * - Appended items are deduped against what's already visible, so an item
 *   that shifted across page boundaries between fetches can't render twice
 *   (duplicate React keys).
 */

import { describe, expect, it } from "vitest";

import { applyLoadMoreResult, feedItemKey } from "../feed-pagination";

const item = (id: string, spaceId = "s1") => ({ id, spaceId });

const baseState = {
	extraItems: [item("3")],
	page: 2,
	hasNextPage: true,
	loadFailed: false,
};

describe("applyLoadMoreResult", () => {
	it("appends new items and advances pagination on success", () => {
		const next = applyLoadMoreResult(baseState, [item("1"), item("2")], {
			ok: true,
			items: [item("4"), item("5")],
			page: 3,
			hasNextPage: false,
		});

		expect(next.extraItems.map((i) => i.id)).toEqual(["3", "4", "5"]);
		expect(next.page).toBe(3);
		expect(next.hasNextPage).toBe(false);
		expect(next.loadFailed).toBe(false);
	});

	it("drops items already visible (same space+id key)", () => {
		const next = applyLoadMoreResult(baseState, [item("1"), item("2")], {
			ok: true,
			items: [item("3"), item("2"), item("4")],
			page: 3,
			hasNextPage: true,
		});

		expect(next.extraItems.map((i) => i.id)).toEqual(["3", "4"]);
	});

	it("treats same id in a different space as a distinct item", () => {
		const next = applyLoadMoreResult(baseState, [item("1")], {
			ok: true,
			items: [item("1", "s2")],
			page: 3,
			hasNextPage: true,
		});

		expect(next.extraItems).toHaveLength(2);
		expect(feedItemKey(item("1", "s2"))).not.toBe(feedItemKey(item("1")));
	});

	it("keeps pagination intact and flags the failure on ok:false", () => {
		const next = applyLoadMoreResult(baseState, [item("1")], {
			ok: false,
			items: [],
			page: 3,
			hasNextPage: false,
		});

		expect(next.extraItems.map((i) => i.id)).toEqual(["3"]);
		expect(next.page).toBe(2); // unchanged — retry re-requests page 3
		expect(next.hasNextPage).toBe(true); // unchanged — don't kill Load More
		expect(next.loadFailed).toBe(true);
	});

	it("clears the failure flag on a subsequent success", () => {
		const failed = { ...baseState, loadFailed: true };
		const next = applyLoadMoreResult(failed, [], {
			ok: true,
			items: [item("4")],
			page: 3,
			hasNextPage: true,
		});

		expect(next.loadFailed).toBe(false);
		expect(next.extraItems.map((i) => i.id)).toEqual(["3", "4"]);
	});
});
