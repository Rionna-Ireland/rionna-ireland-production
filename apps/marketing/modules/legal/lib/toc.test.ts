import { describe, expect, it } from "vitest";

import { extractToc, parseHeadings } from "./toc";

describe("extractToc", () => {
	it("keeps h2 and h3 only, with slug ids", () => {
		const toc = extractToc([
			{ level: 1, text: "Title" },
			{ level: 2, text: "1. Who we are" },
			{ level: 3, text: "Cookies (essential)" },
			{ level: 4, text: "Deep" },
		]);
		expect(toc).toEqual([
			{ id: "1-who-we-are", text: "1. Who we are", level: 2 },
			{ id: "cookies-essential", text: "Cookies (essential)", level: 3 },
		]);
	});
});

describe("parseHeadings", () => {
	it("reads markdown headings, skips fenced code and strips emphasis", () => {
		expect(parseHeadings("# A\n\n## **Bold** one\n```\n## nope\n```\n### Three")).toEqual([
			{ level: 1, text: "A" },
			{ level: 2, text: "Bold one" },
			{ level: 3, text: "Three" },
		]);
	});
});
