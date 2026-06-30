import { describe, it, expect, vi } from "vitest";
import { TheRacingApiProvider } from "../index";

function fakeHttp(routes: Record<string, unknown>) {
	return {
		getJson: vi.fn(async (path: string) => {
			if (!(path in routes)) throw new Error(`unexpected path ${path}`);
			return routes[path];
		}),
	};
}

const racecardToday = {
	racecards: [
		{
			race_id: "rac_1",
			course: "Ascot",
			course_id: "crs_1",
			date: "2026-07-01",
			off_dt: "2026-07-01T14:30:00+00:00",
			race_name: "R",
			type: "Flat",
			distance_f: "8.0",
			race_class: "Class 4",
			going: "Good",
			region: "GB",
			runners: [
				{ horse_id: "hrs_A", horse: "Alpha", trainer: "T1", trainer_id: "trn_1" },
			],
		},
	],
};
const racecardTomorrow = { racecards: [] };

describe("TheRacingApiProvider", () => {
	it("searchHorses maps search_results to ProviderHorse[]", async () => {
		const http = fakeHttp({
			"/v1/horses/search?name=alpha": {
				search_results: [
					{ id: "hrs_A", name: "Alpha", sire: "S", dam: "D", damsire: "DS" },
				],
			},
		});
		const provider = new TheRacingApiProvider(http as never);
		const results = await provider.searchHorses("alpha");
		expect(results[0]).toMatchObject({
			providerHorseId: "hrs_A",
			name: "Alpha",
			sire: "S",
		});
	});

	it("getEntriesForHorse fetches today+tomorrow racecards once and filters by horse", async () => {
		const http = fakeHttp({
			"/v1/racecards/standard?day=today&region_codes=gb&region_codes=ire":
				racecardToday,
			"/v1/racecards/standard?day=tomorrow&region_codes=gb&region_codes=ire":
				racecardTomorrow,
		});
		const provider = new TheRacingApiProvider(http as never);
		const entries = await provider.getEntriesForHorse("hrs_A", {
			lookAheadDays: 7,
		});
		expect(entries).toHaveLength(1);
		expect(entries[0].entry.status).toBe("DECLARED");
		expect(entries[0].entry.trainerName).toBe("T1");
		expect(http.getJson).toHaveBeenCalledTimes(2);
	});

	it("memoizes racecards across multiple horses in one instance (no refetch)", async () => {
		const http = fakeHttp({
			"/v1/racecards/standard?day=today&region_codes=gb&region_codes=ire":
				racecardToday,
			"/v1/racecards/standard?day=tomorrow&region_codes=gb&region_codes=ire":
				racecardTomorrow,
		});
		const provider = new TheRacingApiProvider(http as never);
		await provider.getEntriesForHorse("hrs_A", { lookAheadDays: 7 });
		await provider.getEntriesForHorse("hrs_B", { lookAheadDays: 7 });
		expect(http.getJson).toHaveBeenCalledTimes(2); // not 4 — cached
	});

	it("getRaceResult maps /v1/results/{id}", async () => {
		const http = fakeHttp({
			"/v1/results/rac_1": {
				race_id: "rac_1",
				runners: [{ horse_id: "hrs_A", position: "1", btn: "0" }],
			},
		});
		const provider = new TheRacingApiProvider(http as never);
		const result = await provider.getRaceResult("rac_1");
		expect(result?.entries[0]).toMatchObject({
			providerEntryId: "rac_1_hrs_A",
			finishingPosition: 1,
		});
	});

	it("getHorseProfile maps /v1/horses/{id}/standard", async () => {
		const http = fakeHttp({
			"/v1/horses/hrs_A/standard": {
				id: "hrs_A",
				name: "Alpha",
				sire: "S",
				dam: "D",
				damsire: "DS",
			},
		});
		const provider = new TheRacingApiProvider(http as never);
		const profile = await provider.getHorseProfile("hrs_A");
		expect(profile).toMatchObject({ providerHorseId: "hrs_A", name: "Alpha" });
	});
});
