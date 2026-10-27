import { describe, expect, it } from "vitest";

import { normalizeWebsite, pickFeaturedHorses } from "./website-normalize";

describe("normalizeWebsite", () => {
	const empty = {
		hero: {},
		featuredHorseIds: [],
		stats: [],
		membership: { inclusions: [], faq: [] },
		about: { founders: [] },
		joinMode: "signup",
	};

	it("returns empty slots for undefined and garbage", () => {
		expect(normalizeWebsite(undefined)).toEqual(empty);
		expect(normalizeWebsite("garbage")).toEqual(empty);
		expect(normalizeWebsite({ hero: null })).toEqual(empty);
	});

	it("trims strings and drops blanks", () => {
		expect(normalizeWebsite({ hero: { title: "   ", subtitle: " Hi " } }).hero).toEqual({
			subtitle: "Hi",
		});
	});

	it("drops non-arrays and items with blank required fields", () => {
		const out = normalizeWebsite({
			stats: "nope",
			membership: {
				faq: [
					{ question: "Q", answer: "" },
					{ question: "Q2", answer: "A2" },
				],
			},
		});
		expect(out.stats).toEqual([]);
		expect(out.membership.faq).toEqual([{ question: "Q2", answer: "A2" }]);
	});

	it("drops founders without a name", () => {
		const out = normalizeWebsite({
			about: {
				founders: [
					{ role: "r", bio: "b" },
					{ name: "N", role: "r", bio: "b" },
				],
			},
		});
		expect(out.about.founders).toEqual([{ name: "N", role: "r", bio: "b" }]);
	});

	it("validates joinMode", () => {
		expect(normalizeWebsite({ joinMode: "bogus" }).joinMode).toBe("signup");
		expect(normalizeWebsite({ joinMode: "waitlist" }).joinMode).toBe("waitlist");
	});
});

describe("pickFeaturedHorses", () => {
	const five = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

	it("keeps admin order and drops unknown ids", () => {
		const out = pickFeaturedHorses(five.slice(0, 3), ["c", "x", "a"]);
		expect(out.map((h) => h.id)).toEqual(["c", "a"]);
	});

	it("falls back to the first 4", () => {
		expect(pickFeaturedHorses(five, []).map((h) => h.id)).toEqual(["a", "b", "c", "d"]);
		expect(pickFeaturedHorses(five, ["x"]).map((h) => h.id)).toEqual(["a", "b", "c", "d"]);
	});
});
