import { describe, expect, it } from "vitest";

import { BASE_BLOCKED_WORDS, EXACT_BLOCKED_WORDS } from "../blocked-words";
import { screenText } from "../screen-text";
import { LEGIT_RACING_LINES } from "./fixtures/legit-racing-lines";

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

	describe("expanded UK/Irish word list", () => {
		it.each(BASE_BLOCKED_WORDS)("blocks base term %j in a simple sentence", (term) => {
			const r = screenText(`you absolute ${term}`);
			expect(r.allowed).toBe(false);
			expect(r.matches).toContain(term.toLowerCase());
		});

		it.each(EXACT_BLOCKED_WORDS)("blocks exact term %j in a simple sentence", (term) => {
			const r = screenText(`you absolute ${term}`);
			expect(r.allowed).toBe(false);
			expect(r.matches).toContain(term.toLowerCase());
		});

		it.each(["pr1ck", "d.i.c.k.h.e.a.d", "DICKHEAD", "gobsh1te", "k y s"])(
			"blocks disguised form %j",
			(s) => {
				expect(screenText(s).allowed).toBe(false);
			},
		);

		it.each([
			"dickheads",
			"bastards",
			"scumbags",
			"pricks",
			"nonces",
			"bollocksed",
			"buggered",
		])("blocks suffixed form %j", (s) => {
			expect(screenText(s).allowed).toBe(false);
		});

		it.each(LEGIT_RACING_LINES)("allows legit racing line %#: %j", (line) => {
			expect(screenText(line).allowed).toBe(true);
		});
	});
});
