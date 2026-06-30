import { describe, it, expect } from "vitest";
import { mapSearchHorse, mapRacecardToEntries, mapResult } from "../map";

describe("mapSearchHorse", () => {
	it("maps a search result to a ProviderHorse (pedigree only)", () => {
		const h = mapSearchHorse({
			id: "hrs_1",
			name: "Constitution Hill (GB)",
			sire: "Blue Bresil (FR)",
			dam: "Queen Of The Stage (IRE)",
			damsire: "King's Theatre",
		});
		expect(h).toEqual({
			providerHorseId: "hrs_1",
			name: "Constitution Hill (GB)",
			sire: "Blue Bresil (FR)",
			dam: "Queen Of The Stage (IRE)",
			damsire: "King's Theatre",
		});
	});
});

describe("mapRacecardToEntries", () => {
	const racecard = {
		race_id: "rac_9",
		course: "Ascot",
		course_id: "crs_5",
		date: "2026-07-01",
		off_dt: "2026-07-01T14:30:00+00:00",
		race_name: "Test Handicap",
		type: "Flat",
		distance_f: "8.0",
		race_class: "Class 4",
		going: "Good",
		region: "GB",
		runners: [
			{
				horse_id: "hrs_45568460",
				horse: "My Boy Harry",
				number: "3",
				draw: "5",
				lbs: "133",
				jockey: "P Bradley",
				jockey_id: "jky_1",
				trainer: "Jim & Suzi Best",
				trainer_id: "trn_1",
			},
			{ horse_id: "hrs_other", horse: "Someone Else" },
		],
	};

	it("returns one ProviderEntry per matching linked horse, status DECLARED", () => {
		const entries = mapRacecardToEntries(racecard, new Set(["hrs_45568460"]));
		expect(entries).toHaveLength(1);
		const e = entries[0];
		expect(e.providerHorseId).toBe("hrs_45568460");
		expect(e.meeting.providerCourseId).toBe("crs_5");
		expect(e.meeting.providerMeetingId).toBe("crs_5_2026-07-01");
		expect(e.race.providerRaceId).toBe("rac_9");
		expect(e.race.postTime.toISOString()).toBe("2026-07-01T14:30:00.000Z");
		expect(e.race.distanceFurlongs).toBe(8);
		expect(e.entry.providerEntryId).toBe("rac_9_hrs_45568460");
		expect(e.entry.status).toBe("DECLARED");
		expect(e.entry.draw).toBe(5);
		expect(e.entry.weightLbs).toBe(133);
		expect(e.entry.jockeyName).toBe("P Bradley");
		expect(e.entry.trainerName).toBe("Jim & Suzi Best");
	});

	it("returns [] when no runner matches the linked set", () => {
		expect(mapRacecardToEntries(racecard, new Set(["hrs_none"]))).toEqual([]);
	});
});

describe("mapResult", () => {
	it("maps a result to ProviderResult keyed by race_id_horse_id", () => {
		const result = mapResult({
			race_id: "rac_9",
			runners: [
				{ horse_id: "hrs_45568460", position: "1", btn: "0", or: "75", comment: "stayed on" },
				{ horse_id: "hrs_x", position: "2", btn: "1.5", or: "70" },
			],
		});
		expect(result.providerRaceId).toBe("rac_9");
		const winner = result.entries.find((e) => e.providerEntryId === "rac_9_hrs_45568460");
		expect(winner?.finishingPosition).toBe(1);
		expect(winner?.beatenLengths).toBe(0);
		expect(winner?.ratingAchieved).toBe(75);
		expect(winner?.timeformComment).toBe("stayed on");
	});

	it("ignores runners with a non-numeric position", () => {
		const result = mapResult({
			race_id: "rac_9",
			runners: [{ horse_id: "h1", position: "PU" }, { horse_id: "h2", position: "2" }],
		});
		expect(result.entries.find((e) => e.providerEntryId === "rac_9_h1")?.finishingPosition).toBeUndefined();
		expect(result.entries.find((e) => e.providerEntryId === "rac_9_h2")?.finishingPosition).toBe(2);
	});
});
