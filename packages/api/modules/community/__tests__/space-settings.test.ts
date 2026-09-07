import { describe, expect, it } from "vitest";

import { isAutoJoinSpace, listAutoJoinSpaceIds } from "../lib/space-settings";

describe("isAutoJoinSpace (S12-02b Task 6)", () => {
	it("returns true only when the space's autoJoin flag is explicitly true", () => {
		const metadata = {
			circle: {
				spaces: {
					"1": { autoJoin: true },
					"2": { autoJoin: false },
					"3": {},
				},
			},
		};

		expect(isAutoJoinSpace(metadata, "1")).toBe(true);
		expect(isAutoJoinSpace(metadata, "2")).toBe(false);
		expect(isAutoJoinSpace(metadata, "3")).toBe(false);
	});

	it("fails closed (false) for a space missing from metadata entirely", () => {
		expect(isAutoJoinSpace({}, "unknown")).toBe(false);
		expect(isAutoJoinSpace({ circle: { spaces: {} } }, "unknown")).toBe(false);
	});
});

describe("listAutoJoinSpaceIds (S12-02b Task 6)", () => {
	it("returns only the ids with autoJoin === true", () => {
		const metadata = {
			circle: {
				spaces: {
					"1": { autoJoin: true },
					"2": { autoJoin: false },
					"3": { memberPosting: true },
					"4": { autoJoin: true },
				},
			},
		};

		expect(listAutoJoinSpaceIds(metadata)).toEqual(["1", "4"]);
	});

	it("returns an empty array when metadata.circle.spaces is missing", () => {
		expect(listAutoJoinSpaceIds({})).toEqual([]);
		expect(listAutoJoinSpaceIds({ circle: {} })).toEqual([]);
	});
});
