import { describe, expect, it } from "vitest";

import { screenText } from "../screen-text";

describe("screenText", () => {
	it.each([
		"Scunthorpe United",
		"a class act",
		"please assist me",
		"ridden by Cockburn",
		"shift the schedule",
		"scunt is not a word",
		"",
		"🐎🐎",
	])("allows %j", (s) => expect(screenText(s).allowed).toBe(true));
	it("blocks a base-list slur at a word boundary", () => {
		const r = screenText("what a cunt");
		expect(r.allowed).toBe(false);
		expect(r.matches).toEqual(["cunt"]);
	});
	it("blocks leetspeak, dotted and stretched variants", () => {
		for (const s of ["f.u.c.k off", "fuuuck", "f u c k", "sh1t"])
			expect(screenText(s).allowed).toBe(false);
	});
	it("blocks common suffixed variants", () => {
		for (const s of [
			"fucking hell",
			"what a bunch of cunts",
			"that was shitty",
			"total bullshit",
			"retarded growth",
			"slutty",
		])
			expect(screenText(s).allowed).toBe(false);
	});
	it("blocks club-specific extras", () => {
		expect(screenText("bring the brown envelope", ["brown envelope"]).allowed).toBe(false);
	});
	it("ignores case and diacritics", () => expect(screenText("CÜNT").allowed).toBe(false));
});
