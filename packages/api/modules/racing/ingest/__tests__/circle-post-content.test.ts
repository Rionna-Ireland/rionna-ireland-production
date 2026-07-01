import { describe, it, expect } from "vitest";
import { buildCirclePostContent } from "../circle-post-content";

const horse = { id: "h-1", name: "My Boy Harry" };
const race = { id: "r-1", name: "Novice Stakes", postTime: new Date("2026-07-01T13:45:00Z"), courseName: "Brighton" };

describe("buildCirclePostContent", () => {
	it("DECLARED → runs-in one-liner with HH:mm time", () => {
		const c = buildCirclePostContent("DECLARED", horse, race, { finishingPosition: null }, undefined);
		expect(c).not.toBeNull();
		expect(c!.body).toBe("🏇 My Boy Harry runs in the Novice Stakes at Brighton, 14:45.");
	});
	it("RAN position 1 → won", () => {
		expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: 1 }, 8)!.body)
			.toBe("🏆 My Boy Harry won the Novice Stakes at Brighton!");
	});
	it("RAN placed with field size", () => {
		expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: 4 }, 8)!.body)
			.toBe("My Boy Harry finished 4th of 8 in the Novice Stakes at Brighton.");
	});
	it("RAN placed without field size omits 'of N'", () => {
		expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: 3 }, undefined)!.body)
			.toBe("My Boy Harry finished 3rd in the Novice Stakes at Brighton.");
	});
	it("RAN null position → completed fallback", () => {
		expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: null }, 8)!.body)
			.toBe("My Boy Harry completed the Novice Stakes at Brighton.");
	});
	it("null race name → 'race'", () => {
		expect(buildCirclePostContent("DECLARED", horse, { ...race, name: null }, { finishingPosition: null }, undefined)!.body)
			.toBe("🏇 My Boy Harry runs in the race at Brighton, 14:45.");
	});
	it("non-postable status → null", () => {
		expect(buildCirclePostContent("NON_RUNNER", horse, race, { finishingPosition: null }, undefined)).toBeNull();
		expect(buildCirclePostContent("ENTERED", horse, race, { finishingPosition: null }, undefined)).toBeNull();
	});
});
