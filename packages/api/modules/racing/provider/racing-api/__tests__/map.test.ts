import { describe, it, expect } from "vitest";
import { mapSearchHorse, mapRacecardToEntries, mapResult, mapHorseHistory, num, parseDistF } from "../map";

describe("num", () => {
	it.each([
		[undefined, undefined],
		[null, undefined],
		["0", 0],
		["1.5", 1.5],
		["PU", undefined],
	])("num(%o) === %o", (input, expected) => {
		expect(num(input)).toBe(expected);
	});
});

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

	it("rounds half-furlong racecard distances to the nearest whole furlong", () => {
		const entries = mapRacecardToEntries(
			{ ...racecard, distance_f: "16.5" },
			new Set(["hrs_45568460"]),
		);
		expect(entries[0].race.distanceFurlongs).toBe(17);
	});

	it("returns [] when the racecard omits runners", () => {
		const { runners: _runners, ...noRunners } = racecard;
		expect(
			mapRacecardToEntries(noRunners, new Set(["hrs_45568460"])),
		).toEqual([]);
	});
});

describe("parseDistF", () => {
	it.each([
		[undefined, undefined],
		[null, undefined],
		["22f", 22],
		["7f", 7],
		// Half-furlong trips round to the nearest whole furlong (Int column)
		["16.5f", 17],
		["17.5f", 18],
		["PU", undefined],
	])("parseDistF(%o) === %o", (input, expected) => {
		expect(parseDistF(input)).toBe(expected);
	});
});

describe("mapHorseHistory", () => {
	const historyResponse = {
		results: [
			{
				race_id: "rac_9",
				date: "2025-05-10",
				course: "Ascot",
				course_id: "crs_5",
				off: "7:20",
				off_dt: "2025-05-10T19:20:00+01:00",
				race_name: "Test Handicap",
				type: "Flat",
				class: "Class 4",
				dist_f: "22f",
				going: "Good",
				region: "GB",
				runners: [
					{
						horse_id: "hrs_45568460",
						horse: "My Boy Harry",
						position: "1",
						btn: "0",
						or: "75",
						comment: "stayed on",
						weight_lbs: "133",
						jockey: "P Bradley",
						jockey_id: "jky_1",
						trainer: "Jim & Suzi Best",
						trainer_id: "trn_1",
						headgear: "cp",
						time: "1:38.20",
					},
					{ horse_id: "hrs_other", horse: "Someone Else", position: "2" },
				],
			},
		],
	};

	it("maps career history rows for the requested horse, status RAN", () => {
		const runs = mapHorseHistory(historyResponse, "hrs_45568460");
		expect(runs).toHaveLength(1);
		const run = runs[0];
		expect(run.providerHorseId).toBe("hrs_45568460");
		expect(run.meeting.providerMeetingId).toBe("crs_5_2025-05-10");
		expect(run.meeting.providerCourseId).toBe("crs_5");
		expect(run.race.providerRaceId).toBe("rac_9");
		expect(run.race.postTime.toISOString()).toBe("2025-05-10T18:20:00.000Z");
		expect(run.race.distanceFurlongs).toBe(22);
		expect(run.race.goingDescription).toBe("Good");
		expect(run.entry.providerEntryId).toBe("rac_9_hrs_45568460");
		expect(run.entry.status).toBe("RAN");
		expect(run.entry.weightLbs).toBe(133);
		expect(run.entry.jockeyName).toBe("P Bradley");
		expect(run.entry.trainerName).toBe("Jim & Suzi Best");
		expect(run.result.finishingPosition).toBe(1);
		expect(run.result.beatenLengths).toBe(0);
		expect(run.result.ratingAchieved).toBe(75);
		expect(run.result.timeformComment).toBe("stayed on");
	});

	it("does not include any money/odds fields on the mapped run", () => {
		const run = mapHorseHistory(historyResponse, "hrs_45568460")[0];
		expect(run).not.toHaveProperty("prize");
		expect(run).not.toHaveProperty("sp");
		expect(run).not.toHaveProperty("bsp");
		expect(run.race).not.toHaveProperty("prizeMoney");
	});

	it("returns [] when the horse has no runs for that race", () => {
		expect(mapHorseHistory(historyResponse, "hrs_none")).toEqual([]);
	});

	it("returns [] when results is missing", () => {
		expect(mapHorseHistory({}, "hrs_45568460")).toEqual([]);
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
