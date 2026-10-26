import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MaskedText, splitWords } from "./MaskedText";

describe("splitWords", () => {
	it("splits on whitespace", () => {
		expect(splitWords("Open the gates")).toEqual(["Open", "the", "gates"]);
		expect(splitWords("  a  b ")).toEqual(["a", "b"]);
	});
});

describe("MaskedText", () => {
	it("wraps each word in a mask", () => {
		const html = renderToStaticMarkup(<MaskedText text="Open the gates" />);
		expect(html.match(/class="mask-word"/g)).toHaveLength(3);
	});
});
