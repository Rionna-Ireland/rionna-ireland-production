import { describe, expect, it } from "vitest";

import { groupVoteCounts } from "../vote-counts";

describe("groupVoteCounts", () => {
	it("nests groupBy rows as pollId → optionId → count", () => {
		expect(
			groupVoteCounts([
				{ pollId: "p1", optionId: "o1", _count: { _all: 2 } },
				{ pollId: "p1", optionId: "o2", _count: { _all: 1 } },
				{ pollId: "p2", optionId: "o9", _count: { _all: 4 } },
			]),
		).toEqual({ p1: { o1: 2, o2: 1 }, p2: { o9: 4 } });
	});
	it("returns an empty object for no rows", () => {
		expect(groupVoteCounts([])).toEqual({});
	});
});
