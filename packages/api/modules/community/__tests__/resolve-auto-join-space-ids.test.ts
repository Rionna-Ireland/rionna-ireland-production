import { describe, expect, it } from "vitest";

import type { OrganizationMetadata } from "@repo/database";

import { resolveAutoJoinSpaceIds } from "../lib/resolve-auto-join-space-ids";

const BASE_METADATA: OrganizationMetadata = {
	circle: {
		spaceGroupId: "horse-group",
		spaces: {
			s1: { autoJoin: true },
			s2: { autoJoin: true },
			s3: { autoJoin: true },
			s4: { autoJoin: true },
			s5: { autoJoin: true },
		},
	},
};

describe("resolveAutoJoinSpaceIds", () => {
	it("keeps a public, non-horse autoJoin space", () => {
		const ids = resolveAutoJoinSpaceIds({
			metadata: BASE_METADATA,
			adminSpaces: new Map([["s1", { isPrivate: false, spaceGroupId: null }]]),
			horseSpaceIds: new Set(),
		});
		expect(ids).toEqual(["s1"]);
	});

	it("excludes a private space even when autoJoin is set", () => {
		const ids = resolveAutoJoinSpaceIds({
			metadata: BASE_METADATA,
			adminSpaces: new Map([["s2", { isPrivate: true, spaceGroupId: null }]]),
			horseSpaceIds: new Set(),
		});
		expect(ids).toEqual([]);
	});

	it("excludes a horse space matched via Horse.circleSpaceId", () => {
		const ids = resolveAutoJoinSpaceIds({
			metadata: BASE_METADATA,
			adminSpaces: new Map([["s3", { isPrivate: false, spaceGroupId: null }]]),
			horseSpaceIds: new Set(["s3"]),
		});
		expect(ids).toEqual([]);
	});

	it("excludes a horse space matched only via the group-id signal", () => {
		const ids = resolveAutoJoinSpaceIds({
			metadata: BASE_METADATA,
			adminSpaces: new Map([["s4", { isPrivate: false, spaceGroupId: "horse-group" }]]),
			horseSpaceIds: new Set(),
		});
		expect(ids).toEqual([]);
	});

	it("excludes a space Circle's admin listing didn't return (fails closed)", () => {
		const ids = resolveAutoJoinSpaceIds({
			metadata: BASE_METADATA,
			adminSpaces: new Map(),
			horseSpaceIds: new Set(),
		});
		expect(ids).toEqual([]);
	});

	it("filters a mixed set down to only the safe spaces", () => {
		const ids = resolveAutoJoinSpaceIds({
			metadata: BASE_METADATA,
			adminSpaces: new Map([
				["s1", { isPrivate: false, spaceGroupId: null }],
				["s2", { isPrivate: true, spaceGroupId: null }],
				["s3", { isPrivate: false, spaceGroupId: null }],
				["s4", { isPrivate: false, spaceGroupId: "horse-group" }],
				["s5", { isPrivate: false, spaceGroupId: null }],
			]),
			horseSpaceIds: new Set(["s3"]),
		});
		expect(ids).toEqual(["s1", "s5"]);
	});
});
