import { describe, expect, it } from "vitest";

import { composeBeats, splitBeats } from "./StoryBeats";

describe("splitBeats", () => {
	it("splits on blank lines and drops empties", () => {
		expect(splitBeats("a b\n\n  c \n\n\nd")).toEqual(["a b", "c", "d"]);
		expect(splitBeats("   ")).toEqual([]);
		expect(splitBeats("one")).toEqual(["one"]);
	});
});

describe("composeBeats", () => {
	const fb = "f1\n\nf2\n\nf3\n\nf4\n\nf5\n\nf6";
	it("uses only fallback when admin text is empty", () => {
		expect(composeBeats("  ", fb)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
	});
	it("keeps admin first and tops up to 5", () => {
		expect(composeBeats("a", fb)).toEqual(["a", "f1", "f2", "f3", "f4"]);
	});
	it("uses only admin when it already has enough", () => {
		expect(composeBeats("1\n\n2\n\n3\n\n4\n\n5\n\n6", fb)).toHaveLength(6);
	});
	it("skips fallback beats that duplicate admin ones", () => {
		expect(composeBeats("f1", fb)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
	});
});
