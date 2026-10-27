import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MaskedText, splitWords } from "./MaskedText";
import { Reveal } from "./Reveal";

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

describe("immediate", () => {
	it("MaskedText uses the page-time class and no reveal hooks", () => {
		const html = renderToStaticMarkup(<MaskedText immediate text="Open gates" className="x" />);
		expect(html).toContain('class="ch-title x"');
		expect(html).not.toContain("data-revealed");
	});
	it("Reveal uses ch-rise, not reveal", () => {
		const html = renderToStaticMarkup(<Reveal immediate>hi</Reveal>);
		expect(html).toContain('class="ch-rise"');
		expect(html).not.toMatch(/class="reveal|data-revealed/);
	});
});
