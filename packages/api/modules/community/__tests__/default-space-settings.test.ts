/**
 * Tests for the pure `defaultSpaceSettings` helper used by
 * `packages/database/scripts/seed-space-settings.ts` (S12-02b Task 6).
 *
 * The helper lives in `@repo/database`'s scripts, not `@repo/api` — that
 * package can't depend on `@repo/api` (it would create an import cycle,
 * mirrored by the existing `@repo/payments` → `@repo/api` prohibition — see
 * the comment in `packages/payments/lib/circle-provisioning.ts`). The
 * script itself has no test harness, so the pure function is imported here
 * by relative path instead of duplicating it.
 */
import { describe, expect, it } from "vitest";

import { defaultSpaceSettings } from "../../../../database/scripts/lib/default-space-settings";

const BASE_CTX = {
	horseSpaceIds: new Set<string>(),
	spaceGroupId: "grp-horses",
	eventsSpaceId: "events-1",
};

describe("defaultSpaceSettings (S12-02b Task 6)", () => {
	it("auto-joins a public, non-horse, post-type space", () => {
		const result = defaultSpaceSettings(
			{ id: "space-1", isPrivate: false, spaceType: "basic", spaceGroupId: "grp-general" },
			BASE_CTX,
		);
		expect(result).toEqual({ autoJoin: true });
	});

	it("does not auto-join an image-type space either (also a post type)", () => {
		const result = defaultSpaceSettings(
			{ id: "space-2", isPrivate: false, spaceType: "image", spaceGroupId: null },
			BASE_CTX,
		);
		expect(result).toEqual({ autoJoin: true });
	});

	it("does not auto-join a space whose id matches a Horse.circleSpaceId", () => {
		const result = defaultSpaceSettings(
			{ id: "horse-space-1", isPrivate: false, spaceType: "basic", spaceGroupId: "grp-general" },
			{ ...BASE_CTX, horseSpaceIds: new Set(["horse-space-1"]) },
		);
		expect(result).toEqual({ autoJoin: false });
	});

	it("does not auto-join a space whose spaceGroupId matches the horses group, even if its id isn't a known Horse.circleSpaceId", () => {
		const result = defaultSpaceSettings(
			{ id: "space-3", isPrivate: false, spaceType: "basic", spaceGroupId: "grp-horses" },
			BASE_CTX,
		);
		expect(result).toEqual({ autoJoin: false });
	});

	it("does not auto-join a private space", () => {
		const result = defaultSpaceSettings(
			{ id: "space-4", isPrivate: true, spaceType: "basic", spaceGroupId: "grp-general" },
			BASE_CTX,
		);
		expect(result).toEqual({ autoJoin: false });
	});

	it("does not auto-join a non-post space type (e.g. chat)", () => {
		const result = defaultSpaceSettings(
			{ id: "space-5", isPrivate: false, spaceType: "chat", spaceGroupId: "grp-general" },
			BASE_CTX,
		);
		expect(result).toEqual({ autoJoin: false });
	});

	it("does not auto-join a null spaceType", () => {
		const result = defaultSpaceSettings(
			{ id: "space-6", isPrivate: false, spaceType: null, spaceGroupId: "grp-general" },
			BASE_CTX,
		);
		expect(result).toEqual({ autoJoin: false });
	});

	it("does not auto-join the events space", () => {
		const result = defaultSpaceSettings(
			{ id: "events-1", isPrivate: false, spaceType: "basic", spaceGroupId: "grp-general" },
			BASE_CTX,
		);
		expect(result).toEqual({ autoJoin: false });
	});
});
