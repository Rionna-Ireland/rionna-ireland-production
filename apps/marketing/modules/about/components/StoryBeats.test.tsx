import { describe, expect, it } from "vitest";

import { splitBeats } from "./StoryBeats";

describe("splitBeats", () => {
	it("splits on blank lines and drops empties", () => {
		expect(splitBeats("a b\n\n  c \n\n\nd")).toEqual(["a b", "c", "d"]);
		expect(splitBeats("   ")).toEqual([]);
		expect(splitBeats("one")).toEqual(["one"]);
	});
});
