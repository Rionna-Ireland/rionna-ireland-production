import { describe, expect, it } from "vitest";

import {
	featuredHref,
	formatFeaturedWhen,
	horseSpaceIds,
	relativeTime,
	roleBadge,
	spaceTagTone,
	storyHref,
} from "../post-meta";

describe("spaceTagTone", () => {
	it("horse chip ids win, then name heuristics", () => {
		const horses = horseSpaceIds([
			{ id: "h", kind: "horses", label: "Horses", spaceIds: ["7"] },
		]);
		expect(spaceTagTone("Whatever", "7", horses)).toBe("horses");
		expect(spaceTagTone("Official Announcements", "1", horses)).toBe("official");
		expect(spaceTagTone("Charity", null)).toBe("charity");
		expect(spaceTagTone("News", null)).toBe("news");
		expect(spaceTagTone("Polls", null)).toBe("polls");
		expect(spaceTagTone("Social", null)).toBe("community");
		expect(spaceTagTone("Zzz", null)).toBe("unknown");
		expect(spaceTagTone(null, null)).toBe("unknown");
	});
});

describe("relativeTime", () => {
	const now = Date.parse("2026-10-26T12:00:00Z");
	const ago = (ms: number) => new Date(now - ms).toISOString();
	it("buckets", () => {
		expect(relativeTime(ago(10_000), now)).toEqual({ kind: "justNow" });
		expect(relativeTime(ago(5 * 60_000), now)).toEqual({ kind: "minutesAgo", count: 5 });
		expect(relativeTime(ago(3 * 3_600_000), now)).toEqual({ kind: "hoursAgo", count: 3 });
		expect(relativeTime(ago(2 * 86_400_000), now)).toEqual({ kind: "daysAgo", count: 2 });
		expect(relativeTime(ago(10 * 86_400_000), now)).toEqual({ kind: "date", text: "16 Oct" });
	});
	it("null for missing or invalid", () => {
		expect(relativeTime(null)).toBeNull();
		expect(relativeTime("nope")).toBeNull();
	});
});

describe("roleBadge", () => {
	it("hides without a role and only experts use their own label", () => {
		expect(roleBadge(null)).toBeNull();
		expect(roleBadge("trainer", "Vet")).toEqual({ role: "trainer", customLabel: null });
		expect(roleBadge("expert", " Vet ")).toEqual({ role: "expert", customLabel: "Vet" });
		expect(roleBadge("expert", "  ")).toEqual({ role: "expert", customLabel: null });
	});
});

describe("storyHref", () => {
	it("needs the marketing url", () => {
		expect(storyHref("a b", undefined)).toBeNull();
		expect(storyHref("a-b", "https://rionna.com/")).toBe("https://rionna.com/news/a-b");
	});
});

describe("featured", () => {
	it("formats the weekday and clock", () => {
		expect(formatFeaturedWhen("nope")).toBeNull();
		const d = new Date(2026, 9, 29, 20, 0).toISOString(); // Thursday, local
		expect(formatFeaturedWhen(d)).toBe("Thursday 8pm");
		expect(formatFeaturedWhen(new Date(2026, 9, 29, 8, 30).toISOString())).toBe(
			"Thursday 8:30am",
		);
	});
	it("links to the questions thread only", () => {
		expect(featuredHref("/c", {})).toBeNull();
		expect(featuredHref("/c", { questionsPostId: "p", questionsSpaceId: "s" })).toBe(
			"/c/feed/s/p",
		);
	});
});
