import { describe, expect, it } from "vitest";

import type { OrganizationMetadata } from "@repo/database";

import { buildFeedChips } from "../lib/build-feed-chips";
import type { MemberSpace } from "../lib/types";

function space(overrides: Partial<MemberSpace> & { id: string; name: string }): MemberSpace {
	return {
		emoji: null,
		canCreatePost: true,
		isMember: true,
		isPrivate: false,
		spaceGroupId: null,
		isPostDisabled: false,
		spaceType: "basic",
		...overrides,
	};
}

const ANNOUNCEMENTS = space({ id: "s1", name: "Announcements", spaceGroupId: "g1" });
const INSIDE_TRACK = space({ id: "s2", name: "Inside Track", spaceGroupId: "g1" });
const NETWORKING = space({ id: "s3", name: "Networking", spaceGroupId: "g1" });
const HARRY = space({ id: "h1", name: "Harry", spaceGroupId: "hg" });
const LASKA = space({ id: "h2", name: "Laska", spaceGroupId: "hg" });
const CHAT_SPACE = space({ id: "c1", name: "Chat space", spaceType: "chat", spaceGroupId: "g1" });

const METADATA: OrganizationMetadata = {
	circle: {
		spaceGroupId: "hg",
		spaces: {
			s2: { hideChip: true },
		},
	},
};

describe("buildFeedChips", () => {
	it("collapses horse spaces, hides admin-hidden chips, excludes non-post space types, preserves order", () => {
		const spaces = [ANNOUNCEMENTS, INSIDE_TRACK, NETWORKING, HARRY, LASKA, CHAT_SPACE];
		const horseSpaceIds = new Set(["h1", "h2"]);

		const chips = buildFeedChips({ spaces, metadata: METADATA, horseSpaceIds });

		expect(chips).toEqual([
			{ id: "all", kind: "all", label: "All", spaceIds: [] },
			{ id: "horses", kind: "horses", label: "Horses", spaceIds: ["h1", "h2"] },
			{ id: "news", kind: "news", label: "News", spaceIds: [] },
			{ id: "charity", kind: "charity", label: "Charity", spaceIds: [] },
			{ id: "polls", kind: "polls", label: "Polls", spaceIds: [] },
			{ id: "space:s1", kind: "space", label: "Announcements", spaceIds: [] },
			{ id: "space:s3", kind: "space", label: "Networking", spaceIds: [] },
		]);
	});

	it("omits the horses chip when the member is in no horse space", () => {
		const spaces = [ANNOUNCEMENTS, NETWORKING];
		const chips = buildFeedChips({ spaces, metadata: {}, horseSpaceIds: new Set() });

		expect(chips.map((c) => c.kind)).toEqual(["all", "news", "charity", "polls", "space", "space"]);
	});

	it("excludes spaces the member is not a member of", () => {
		const notMember = space({ id: "s4", name: "Not Joined", isMember: false });
		const chips = buildFeedChips({
			spaces: [ANNOUNCEMENTS, notMember],
			metadata: {},
			horseSpaceIds: new Set(),
		});

		expect(chips.some((c) => c.id === "space:s4")).toBe(false);
	});

	it("treats a space as a horse space via horseSpaceIds even when spaceGroupId doesn't match metadata", () => {
		const driftedHorse = space({ id: "h3", name: "Drifted Horse", spaceGroupId: "other-group" });
		const chips = buildFeedChips({
			spaces: [driftedHorse],
			metadata: METADATA,
			horseSpaceIds: new Set(["h3"]),
		});

		const horsesChip = chips.find((c) => c.kind === "horses");
		expect(horsesChip?.spaceIds).toEqual(["h3"]);
		expect(chips.some((c) => c.id === "space:h3")).toBe(false);
	});

	it("drops news and charity when features.news is false", () => {
		const chips = buildFeedChips({
			spaces: [ANNOUNCEMENTS],
			metadata: { features: { news: false } },
			horseSpaceIds: new Set(),
		});

		expect(chips.map((c) => c.kind)).toEqual(["all", "polls", "space"]);
	});

	it("drops polls when features.polls is false", () => {
		const chips = buildFeedChips({
			spaces: [ANNOUNCEMENTS],
			metadata: { features: { polls: false } },
			horseSpaceIds: new Set(),
		});

		expect(chips.map((c) => c.kind)).toEqual(["all", "news", "charity", "space"]);
	});
});
