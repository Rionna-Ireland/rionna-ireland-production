import { describe, expect, it } from "vitest";

import { feedItemKey } from "../feed-pagination";

describe("feedItemKey", () => {
	it("treats the same id in a different space as a distinct item", () => {
		expect(feedItemKey({ id: "1", spaceId: "s2" })).not.toBe(
			feedItemKey({ id: "1", spaceId: "s1" }),
		);
	});
});
