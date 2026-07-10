import { describe, expect, it } from "vitest";

import {
	applyFollowToggle,
	countFollowing,
	firstPhotoUrl,
	formatDistance,
	formatResultDetail,
	getOrdinal,
	isNextRunForHorse,
	isPendingForHorse,
	pedigreeLines,
	recentResults,
	shouldHideSection,
	type FollowableHorse,
} from "../my-horses-section-logic";

const horses: FollowableHorse[] = [
	{ id: "h1", name: "Shadowfax", isFollowing: true },
	{ id: "h2", name: "Bucephalus", isFollowing: false },
];

describe("applyFollowToggle", () => {
	it("flips the targeted horse's follow state, leaving the rest untouched", () => {
		expect(applyFollowToggle(horses, "h2", true)).toEqual([
			{ id: "h1", name: "Shadowfax", isFollowing: true },
			{ id: "h2", name: "Bucephalus", isFollowing: true },
		]);
	});

	it("is a no-op for an unknown horse id", () => {
		expect(applyFollowToggle(horses, "unknown", true)).toEqual(horses);
	});

	it("passes through undefined (no cached list yet)", () => {
		expect(applyFollowToggle(undefined, "h1", true)).toBeUndefined();
	});
});

describe("countFollowing", () => {
	it("counts followed horses", () => {
		expect(countFollowing(horses)).toBe(1);
	});

	it("is 0 for undefined or empty", () => {
		expect(countFollowing(undefined)).toBe(0);
		expect(countFollowing([])).toBe(0);
	});
});

describe("shouldHideSection", () => {
	it("hides once loaded with zero published horses", () => {
		expect(shouldHideSection(false, [])).toBe(true);
		expect(shouldHideSection(false, undefined)).toBe(true);
	});

	it("does not hide while loading, even with no data yet", () => {
		expect(shouldHideSection(true, undefined)).toBe(false);
	});

	it("does not hide once loaded with horses present", () => {
		expect(shouldHideSection(false, horses)).toBe(false);
	});
});

describe("isPendingForHorse", () => {
	it("is true only when pending and variables match the horse id", () => {
		expect(isPendingForHorse({ isPending: true, variables: { horseId: "h1" } }, "h1")).toBe(true);
	});

	it("is false when pending for a different horse", () => {
		expect(isPendingForHorse({ isPending: true, variables: { horseId: "h2" } }, "h1")).toBe(false);
	});

	it("is false when not pending", () => {
		expect(isPendingForHorse({ isPending: false, variables: { horseId: "h1" } }, "h1")).toBe(false);
	});

	it("is false when no variables are set yet", () => {
		expect(isPendingForHorse({ isPending: true, variables: undefined }, "h1")).toBe(false);
	});
});

describe("firstPhotoUrl", () => {
	it("returns the first photo's url", () => {
		expect(firstPhotoUrl([{ url: "https://example.com/a.jpg" }, { url: "b.jpg" }])).toBe(
			"https://example.com/a.jpg",
		);
	});

	it("returns null for an empty or missing array", () => {
		expect(firstPhotoUrl([])).toBeNull();
		expect(firstPhotoUrl(undefined)).toBeNull();
		expect(firstPhotoUrl(null)).toBeNull();
	});

	it("returns null for malformed entries", () => {
		expect(firstPhotoUrl("not-an-array")).toBeNull();
		expect(firstPhotoUrl([{}])).toBeNull();
	});
});

describe("pedigreeLines", () => {
	it("returns present fields in sire/dam/damsire order", () => {
		expect(pedigreeLines({ sire: "Galileo", dam: "Urban Sea", damsire: "Miswaki" })).toEqual([
			{ label: "sire", name: "Galileo" },
			{ label: "dam", name: "Urban Sea" },
			{ label: "damsire", name: "Miswaki" },
		]);
	});

	it("omits missing fields", () => {
		expect(pedigreeLines({ sire: "Galileo" })).toEqual([{ label: "sire", name: "Galileo" }]);
	});

	it("returns an empty array for null/non-object pedigree", () => {
		expect(pedigreeLines(null)).toEqual([]);
		expect(pedigreeLines(undefined)).toEqual([]);
		expect(pedigreeLines("nope")).toEqual([]);
	});
});

describe("formatDistance", () => {
	it("formats miles + furlongs", () => {
		expect(formatDistance(22)).toBe("2m6f");
	});

	it("formats furlongs only", () => {
		expect(formatDistance(7)).toBe("7f");
	});

	it("formats whole miles", () => {
		expect(formatDistance(16)).toBe("2m");
	});
});

describe("getOrdinal", () => {
	it("formats common cases", () => {
		expect(getOrdinal(1)).toBe("1st");
		expect(getOrdinal(2)).toBe("2nd");
		expect(getOrdinal(3)).toBe("3rd");
		expect(getOrdinal(4)).toBe("4th");
		expect(getOrdinal(11)).toBe("11th");
	});
});

describe("formatResultDetail", () => {
	it("joins jockey, distance, and going with a middle dot", () => {
		expect(
			formatResultDetail({
				jockey: { name: "R. Moore" },
				race: { distanceFurlongs: 22, goingDescription: "Good to Soft" },
			}),
		).toBe("R. Moore · 2m6f · Good to Soft");
	});

	it("drops missing parts", () => {
		expect(formatResultDetail({ race: { distanceFurlongs: 7 } })).toBe("7f");
	});

	it("is empty when nothing is available", () => {
		expect(formatResultDetail({})).toBe("");
	});
});

describe("recentResults", () => {
	it("truncates to the limit", () => {
		expect(recentResults([1, 2, 3, 4], 3)).toEqual([1, 2, 3]);
	});

	it("defaults to undefined entries as an empty array", () => {
		expect(recentResults(undefined)).toEqual([]);
	});
});

describe("isNextRunForHorse", () => {
	it("matches when the next-run entry belongs to this horse", () => {
		expect(isNextRunForHorse({ horseId: "h1" }, "h1")).toBe(true);
	});

	it("does not match a different horse, or a missing next run", () => {
		expect(isNextRunForHorse({ horseId: "h1" }, "h2")).toBe(false);
		expect(isNextRunForHorse(null, "h1")).toBe(false);
		expect(isNextRunForHorse(undefined, "h1")).toBe(false);
	});
});
