import { describe, it, expect } from "vitest";
import { buildCirclePostContent, formatDistance } from "../circle-post-content";

const horse = { id: "h-1", name: "My Boy Harry" };
const race = {
	id: "r-1",
	name: "Novice Stakes",
	postTime: new Date("2026-07-01T13:45:00Z"),
	courseName: "Brighton",
	distanceFurlongs: null,
	goingDescription: null,
};
const noEntryDetail = { finishingPosition: null, jockeyName: null };

describe("formatDistance", () => {
	it.each([
		[22, "2m6f"],
		[7, "7f"],
		[16, "2m"],
		[8, "1m"],
		[0, "0f"],
	])("formatDistance(%i) === %s", (furlongs, expected) => {
		expect(formatDistance(furlongs)).toBe(expected);
	});
});

describe("buildCirclePostContent", () => {
	it("DECLARED → runs-in one-liner with HH:mm time", () => {
		const c = buildCirclePostContent("DECLARED", horse, race, noEntryDetail, undefined);
		expect(c).not.toBeNull();
		expect(c!.body).toBe("🏇 My Boy Harry runs in the Novice Stakes at Brighton, 14:45.");
	});
	it("DECLARED → includes jockey, distance and going when available", () => {
		const enrichedRace = { ...race, distanceFurlongs: 22, goingDescription: "Soft" };
		const c = buildCirclePostContent(
			"DECLARED",
			horse,
			enrichedRace,
			{ finishingPosition: null, jockeyName: "P Townend" },
			undefined,
		);
		expect(c!.body).toBe(
			"🏇 My Boy Harry runs in the Novice Stakes at Brighton, 14:45. P Townend rides. 2m6f, going Soft.",
		);
	});
	it("DECLARED → omits missing parts gracefully (jockey only)", () => {
		const c = buildCirclePostContent(
			"DECLARED",
			horse,
			race,
			{ finishingPosition: null, jockeyName: "P Townend" },
			undefined,
		);
		expect(c!.body).toBe("🏇 My Boy Harry runs in the Novice Stakes at Brighton, 14:45. P Townend rides.");
	});
	it("DECLARED → omits missing parts gracefully (distance only)", () => {
		const enrichedRace = { ...race, distanceFurlongs: 7 };
		const c = buildCirclePostContent("DECLARED", horse, enrichedRace, noEntryDetail, undefined);
		expect(c!.body).toBe("🏇 My Boy Harry runs in the Novice Stakes at Brighton, 14:45. 7f.");
	});
	it("RAN position 1 → won", () => {
		expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: 1, jockeyName: null }, 8)!.body)
			.toBe("🏆 My Boy Harry won the Novice Stakes at Brighton!");
	});
	it("RAN placed with field size", () => {
		expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: 4, jockeyName: null }, 8)!.body)
			.toBe("My Boy Harry finished 4th of 8 in the Novice Stakes at Brighton.");
	});
	it("RAN placed without field size omits 'of N'", () => {
		expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: 3, jockeyName: null }, undefined)!.body)
			.toBe("My Boy Harry finished 3rd in the Novice Stakes at Brighton.");
	});
	it("RAN null position → completed fallback", () => {
		expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: null, jockeyName: null }, 8)!.body)
			.toBe("My Boy Harry completed the Novice Stakes at Brighton.");
	});

	describe("RAN → details block (Amendment A1)", () => {
		const enrichedRace = { ...race, distanceFurlongs: 22, goingDescription: "Soft" };
		const jockeyEntry = { jockeyName: "Eoghan Finegan" };

		it("win → includes jockey (rode), distance and going when available", () => {
			const c = buildCirclePostContent(
				"RAN",
				horse,
				enrichedRace,
				{ finishingPosition: 1, ...jockeyEntry },
				8,
			);
			expect(c!.body).toBe(
				"🏆 My Boy Harry won the Novice Stakes at Brighton! Eoghan Finegan rode. 2m6f, going Soft.",
			);
		});
		it("placed → includes jockey (rode), distance and going when available", () => {
			const c = buildCirclePostContent(
				"RAN",
				horse,
				enrichedRace,
				{ finishingPosition: 6, ...jockeyEntry },
				8,
			);
			expect(c!.body).toBe(
				"My Boy Harry finished 6th of 8 in the Novice Stakes at Brighton. Eoghan Finegan rode. 2m6f, going Soft.",
			);
		});
		it("null position fallback → includes details block when available", () => {
			const c = buildCirclePostContent(
				"RAN",
				horse,
				enrichedRace,
				{ finishingPosition: null, ...jockeyEntry },
				8,
			);
			expect(c!.body).toBe(
				"My Boy Harry completed the Novice Stakes at Brighton. Eoghan Finegan rode. 2m6f, going Soft.",
			);
		});
		it("win → omits missing parts gracefully (jockey only)", () => {
			const c = buildCirclePostContent("RAN", horse, race, { finishingPosition: 1, ...jockeyEntry }, 8);
			expect(c!.body).toBe("🏆 My Boy Harry won the Novice Stakes at Brighton! Eoghan Finegan rode.");
		});
		it("placed → omits missing parts gracefully (distance only)", () => {
			const distanceOnlyRace = { ...race, distanceFurlongs: 7 };
			const c = buildCirclePostContent(
				"RAN",
				horse,
				distanceOnlyRace,
				{ finishingPosition: 4, jockeyName: null },
				8,
			);
			expect(c!.body).toBe("My Boy Harry finished 4th of 8 in the Novice Stakes at Brighton. 7f.");
		});
		it("placed → omits missing parts gracefully (going only)", () => {
			const goingOnlyRace = { ...race, goingDescription: "Good to Firm" };
			const c = buildCirclePostContent(
				"RAN",
				horse,
				goingOnlyRace,
				{ finishingPosition: 4, jockeyName: null },
				8,
			);
			expect(c!.body).toBe("My Boy Harry finished 4th of 8 in the Novice Stakes at Brighton. going Good to Firm.");
		});
		it("win → all detail fields null reproduces today's exact string (backward compat)", () => {
			expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: 1, jockeyName: null }, 8)!.body)
				.toBe("🏆 My Boy Harry won the Novice Stakes at Brighton!");
		});
		it("placed → all detail fields null reproduces today's exact string (backward compat)", () => {
			expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: 4, jockeyName: null }, 8)!.body)
				.toBe("My Boy Harry finished 4th of 8 in the Novice Stakes at Brighton.");
		});
		it("fallback → all detail fields null reproduces today's exact string (backward compat)", () => {
			expect(buildCirclePostContent("RAN", horse, race, { finishingPosition: null, jockeyName: null }, 8)!.body)
				.toBe("My Boy Harry completed the Novice Stakes at Brighton.");
		});
	});
	it("null race name → 'race'", () => {
		expect(buildCirclePostContent("DECLARED", horse, { ...race, name: null }, noEntryDetail, undefined)!.body)
			.toBe("🏇 My Boy Harry runs in the race at Brighton, 14:45.");
	});
	it("non-postable status → null", () => {
		expect(buildCirclePostContent("NON_RUNNER", horse, race, noEntryDetail, undefined)).toBeNull();
		expect(buildCirclePostContent("ENTERED", horse, race, noEntryDetail, undefined)).toBeNull();
	});
});
