import { createHash } from "node:crypto";

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

	it("default markup equals the pre-move waitlist snapshot (sha256)", () => {
		const html = renderToStaticMarkup(<PatternMosaic />);
		expect(
			html.startsWith(
				'<div aria-hidden="true" class="grid grid-cols-4 content-start overflow-hidden">',
			),
		).toBe(true);
		expect(createHash("sha256").update(html).digest("hex")).toBe(
			"f3a3506d0e05e770891d114ee6fc0420ad3a6e1b629d5d0468eef8ddda418cc9",
		);
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
	const render = (kind: TileKind, colourway: keyof typeof COLOURWAYS) =>
		renderToStaticMarkup(<PatternTile spec={{ kind, colourway, turn: 0 }} />);

	it("submarkQuad plum: cream centre, lilac corners", () => {
		const html = render("submarkQuad", "plum");
		expect(html).toContain('fill="#EEEADF" transform="translate(77.5 84)"');
		expect(html).toContain('fill="#CCA1D0" transform="translate(-22.5 -20)"');
	});
	it.each([
		["pinkTint", "#57385A", "#CCA1D0"],
		["iceTint", "#374B6C", "#B9D8E1"],
		["sageTint", "#043F29", "#A6B999"],
		["greenMark", "#EEEADF", "#D4DCCE"],
	] as const)("submarkQuad %s: mark %s, corners %s", (cw, mark, corner) => {
		const html = render("submarkQuad", cw);
		expect(html).toContain(`fill="${mark}" transform="translate(77.5 84)"`);
		expect(html).toContain(`fill="${corner}" transform="translate(177.5 180)"`);
	});
	it("halfDrop has a 200x102 viewBox and cream/white fills", () => {
		const html = render("halfDrop", "cream");
		expect(html).toContain('viewBox="0 0 200 102"');
		expect(html).toContain('fill="#FFFFFF"');
	});
	it("ring lilac: lilac ground, cream star", () => {
		const html = render("ring", "lilac");
		expect(html).toContain('<rect width="200" height="200" fill="#CCA1D0">');
		expect(html).toContain('fill="#EEEADF"');
	});
});
