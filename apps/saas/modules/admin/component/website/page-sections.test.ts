import { describe, expect, it } from "vitest";

import { humanize, layoutPage } from "./page-sections";

describe("layoutPage", () => {
	it("puts slots in their text section and slot-only sections after their anchor", () => {
		const s = layoutPage("home", [
			"home.arrival.tagline",
			"home.hero.joinCta",
			"home.horses.title",
			"home.news.title",
		]);
		expect(s.map((x) => x.id)).toEqual([
			"home.arrival",
			"home.hero",
			"home.horses",
			"stats",
			"home.news",
		]);
		expect(s.find((x) => x.id === "home.hero")?.blocks).toEqual(["hero"]);
		expect(s.find((x) => x.id === "stats")).toMatchObject({
			keys: [],
			blocks: ["stats"],
			extra: true,
		});
	});

	it("keeps top-of-page slot sections in listed order", () => {
		const s = layoutPage("common", ["common.footer.privacy"]);
		expect(s.map((x) => x.id)).toEqual(["join", "share", "common.footer"]);
	});

	it("still shows slots when the anchor text is missing", () => {
		expect(layoutPage("about", []).map((x) => x.id)).toEqual(["people"]);
	});
});

describe("humanize", () => {
	it("reads keys as words", () => {
		expect(humanize("finalCta")).toBe("Final button");
		expect(humanize("liveRaceData")).toBe("Live race data");
		expect(humanize("faq")).toBe("FAQ");
		expect(humanize("aria")).toBe("Screen reader labels");
	});
});
