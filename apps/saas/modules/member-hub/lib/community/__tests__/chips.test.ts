import type { FeedChip } from "@repo/api/modules/community/lib/types";
import { describe, expect, it } from "vitest";

import {
	announcementSpaceIdsFromChips,
	chipToFilter,
	emptyKindForChip,
	nextChipIndex,
	selectAnnouncements,
} from "../chips";

const chip = (
	kind: FeedChip["kind"],
	spaceIds: string[] = [],
	label = kind as string,
): FeedChip => ({
	id: kind,
	kind,
	label,
	spaceIds,
});

const post = (over: Record<string, unknown>) =>
	({ id: "p", spaceId: "s", kind: "post", spaceName: null, createdAt: null, ...over }) as never;

describe("chipToFilter", () => {
	it("maps each chip kind to getMemberFeed filter inputs", () => {
		expect(chipToFilter(undefined)).toEqual({});
		expect(chipToFilter(chip("all"))).toEqual({});
		expect(chipToFilter(chip("horses", ["1", "2"]))).toEqual({ filterSpaceIds: ["1", "2"] });
		expect(chipToFilter(chip("space", ["9"]))).toEqual({ filterSpaceIds: ["9"] });
		expect(chipToFilter(chip("news"))).toEqual({ filterKind: "story" });
		expect(chipToFilter(chip("charity"))).toEqual({
			filterKind: "story",
			filterCategory: "charity",
		});
		expect(chipToFilter(chip("polls"))).toEqual({ filterKind: "poll" });
	});
});

describe("emptyKindForChip", () => {
	it("picks per-chip empty copy, defaulting for all", () => {
		expect(emptyKindForChip(undefined)).toBe("default");
		expect(emptyKindForChip(chip("all"))).toBe("default");
		expect(emptyKindForChip(chip("space"))).toBe("space");
		expect(emptyKindForChip(chip("horses"))).toBe("horses");
		expect(emptyKindForChip(chip("polls"))).toBe("polls");
		expect(emptyKindForChip(chip("news"))).toBe("stories");
		expect(emptyKindForChip(chip("charity"))).toBe("stories");
	});
});

describe("announcements", () => {
	it("finds announcement space ids from space chips only", () => {
		const chips = [
			chip("space", ["a"], "Official Announcements"),
			chip("space", ["b"], "Chat"),
			chip("news", [], "Announcements"),
		];
		expect(announcementSpaceIdsFromChips(chips)).toEqual(["a"]);
	});

	it("backend flag wins over the name heuristic", () => {
		const items = [
			post({ id: "1", isAnnouncement: false, spaceName: "Announcements" }),
			post({ id: "2", isAnnouncement: true }),
		];
		expect(selectAnnouncements(items).map((i) => i.id)).toEqual(["2"]);
	});

	it("falls back to heuristics, drops non-posts, sorts newest first and caps", () => {
		const items = [
			post({ id: "old", spaceName: "Announcements", createdAt: "2026-01-01T00:00:00Z" }),
			post({ id: "new", spaceId: "a", createdAt: "2026-02-01T00:00:00Z" }),
			post({ id: "poll", kind: "poll", isAnnouncement: true }),
			post({ id: "nospace", spaceId: null, isAnnouncement: true }),
		];
		expect(selectAnnouncements(items, ["a"]).map((i) => i.id)).toEqual(["new", "old"]);
		expect(selectAnnouncements(items, ["a"], 1)).toHaveLength(1);
		expect(selectAnnouncements(undefined)).toEqual([]);
	});
});

describe("nextChipIndex", () => {
	it("moves with arrows, wraps, and jumps with Home and End", () => {
		expect(nextChipIndex("ArrowRight", 0, 3)).toBe(1);
		expect(nextChipIndex("ArrowDown", 2, 3)).toBe(0);
		expect(nextChipIndex("ArrowLeft", 0, 3)).toBe(2);
		expect(nextChipIndex("ArrowUp", 2, 3)).toBe(1);
		expect(nextChipIndex("Home", 2, 3)).toBe(0);
		expect(nextChipIndex("End", 0, 3)).toBe(2);
	});
	it("ignores other keys", () => {
		expect(nextChipIndex("Tab", 1, 3)).toBeNull();
		expect(nextChipIndex("a", 1, 3)).toBeNull();
	});
});
