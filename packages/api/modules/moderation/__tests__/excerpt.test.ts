import { describe, expect, it } from "vitest";
import { excerptOf } from "../excerpt";

describe("excerptOf", () => {
	it("collapses whitespace and trims", () => expect(excerptOf("  a \n\n b  ")).toBe("a b"));
	it("slices to max with an ellipsis", () => expect(excerptOf("x".repeat(300), 10)).toBe(`${"x".repeat(9)}…`));
	it("leaves short text alone", () => expect(excerptOf("hello", 10)).toBe("hello"));
});
