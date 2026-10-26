import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { dealDelay, PatternMosaic } from "./PatternMosaic";
import { COLOURWAYS, PatternTile, type TileKind } from "./tiles";

describe("dealDelay", () => {
	it("steps diagonally", () => {
		expect(dealDelay(0, 4)).toBe(0);
		expect(dealDelay(5, 4)).toBe(180);
		expect(dealDelay(31, 4)).toBe(900);
	});
});

describe("PatternMosaic", () => {
	it("renders 32 slots with the last delayed 900ms", () => {
		const html = renderToStaticMarkup(<PatternMosaic />);
		expect(html.match(/class="pc-slot/g)).toHaveLength(32);
		expect(html.lastIndexOf("--delay:900ms")).toBeGreaterThan(html.lastIndexOf("pc-slot"));
	});

	it("default markup equals the pre-move waitlist snapshot", () => {
		const expected = readFileSync(
			new URL("./pattern-mosaic-default.fixture.html", import.meta.url),
			"utf8",
		);
		expect(renderToStaticMarkup(<PatternMosaic />)).toBe(expected);
	});

	it("honours columns, rows and colourway", () => {
		const html = renderToStaticMarkup(<PatternMosaic columns={2} rows={3} colourway="plum" />);
		expect(html.match(/class="pc-slot/g)).toHaveLength(6);
		expect(html).toContain("#3A243C");
	});

	it("view trigger waits (pc-wait) until in view", () => {
		expect(renderToStaticMarkup(<PatternMosaic trigger="view" />)).toContain("pc-wait");
		expect(renderToStaticMarkup(<PatternMosaic />)).not.toContain("pc-wait");
	});
});

describe("new tile kinds", () => {
	const cases: [TileKind, keyof typeof COLOURWAYS][] = [
		["submarkQuad", "plum"],
		["submarkQuad", "pinkTint"],
		["submarkQuad", "iceTint"],
		["submarkQuad", "sageTint"],
		["halfDrop", "cream"],
		["ring", "lilac"],
		["quad", "white"],
	];
	it.each(cases)("%s / %s renders paths", (kind, colourway) => {
		const html = renderToStaticMarkup(<PatternTile spec={{ kind, colourway, turn: 0 }} />);
		expect(html).toContain("<path");
	});
});
