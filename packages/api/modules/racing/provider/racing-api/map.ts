/**
 * Pure mappers: The Racing API JSON -> RacingDataProvider domain types.
 *
 * Synthesized ids (the API has no entry/meeting id — see plan "Identifier
 * conventions"):
 *   providerMeetingId = `${course_id}_${date}`
 *   providerEntryId   = `${race_id}_${horse_id}`
 */

import type {
	HorseSexValue,
	ProviderEntry,
	ProviderHistoricalRun,
	ProviderHorse,
	ProviderHorseFacts,
	ProviderResult,
} from "../types";

export interface ApiSearchHorse {
	id: string;
	name: string;
	sire?: string | null;
	dam?: string | null;
	damsire?: string | null;
	// `/pro` only (S13-10)
	colour?: string | null;
	sex?: string | null;
	sex_code?: string | null;
	dob?: string | null;
	region?: string | null;
}

export interface ApiRunner {
	horse_id: string;
	horse?: string;
	number?: string;
	draw?: string;
	lbs?: string;
	jockey?: string;
	jockey_id?: string;
	trainer?: string;
	trainer_id?: string;
	trainer_location?: string;
	colour?: string;
	sex?: string;
	sex_code?: string;
	dob?: string;
	region?: string;
}

export interface ApiRacecard {
	race_id: string;
	course: string;
	course_id: string;
	date: string;
	off_dt: string;
	race_name?: string;
	type?: string;
	distance_f?: string;
	race_class?: string;
	going?: string;
	region?: string;
	runners?: ApiRunner[] | null;
}

export interface ApiResultRunner {
	horse_id: string;
	position?: string;
	btn?: string;
	or?: string;
	comment?: string;
}

export interface ApiResult {
	race_id: string;
	runners?: ApiResultRunner[] | null;
}

const COLOUR_WORDS: Record<string, string> = {
	b: "Bay",
	gr: "Grey",
	ch: "Chestnut",
	br: "Brown",
	bl: "Black",
	"b/br": "Bay/Brown",
	ro: "Roan",
};

/** "b" -> "Bay". Unknown codes fall back to the capitalised raw value. */
export function mapColour(raw: string | null | undefined): string | undefined {
	const code = raw?.trim().toLowerCase();
	if (!code) return undefined;
	return COLOUR_WORDS[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
}

const SEX_WORDS: Record<string, HorseSexValue> = {
	filly: "FILLY",
	f: "FILLY",
	colt: "COLT",
	c: "COLT",
	mare: "MARE",
	m: "MARE",
	gelding: "GELDING",
	g: "GELDING",
	h: "STALLION",
	horse: "STALLION",
	stallion: "STALLION",
	rig: "STALLION",
	r: "STALLION",
};

/** "colt" / "C" -> "COLT". Unknown -> undefined (stored as null). */
export function mapSex(...raws: Array<string | null | undefined>): HorseSexValue | undefined {
	for (const raw of raws) {
		const v = raw?.trim().toLowerCase();
		if (v && SEX_WORDS[v]) return SEX_WORDS[v];
	}
	return undefined;
}

export function mapHorseFacts(r: {
	colour?: string | null;
	sex?: string | null;
	sex_code?: string | null;
	dob?: string | null;
	region?: string | null;
}): ProviderHorseFacts | undefined {
	const dob = r.dob?.trim();
	const facts: ProviderHorseFacts = {
		colour: mapColour(r.colour),
		sex: mapSex(r.sex, r.sex_code),
		foaledOn: dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : undefined,
		foaledCountry: r.region?.trim() || undefined,
	};
	return Object.values(facts).some((v) => v !== undefined) ? facts : undefined;
}

export function num(v: string | undefined | null): number | undefined {
	if (v == null) {
		return undefined;
	}
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

/**
 * Race.distanceFurlongs is an Int column, but the API reports half-furlong
 * trips (e.g. "16.5"/"16.5f") — round to the nearest whole furlong so the
 * race upsert doesn't throw.
 */
export function roundFurlongs(v: number | undefined): number | undefined {
	return v == null ? undefined : Math.round(v);
}

/**
 * The /horses/{id}/results endpoint reports distance as `dist_f` — a string
 * with a trailing "f" (e.g. "22f") — unlike racecards' bare `distance_f`.
 * Strip the unit before reusing `num()`, then round (Int column).
 */
export function parseDistF(v: string | undefined | null): number | undefined {
	if (v == null) {
		return undefined;
	}
	return roundFurlongs(num(v.replace(/f$/i, "")));
}

export function entryId(raceId: string, horseId: string): string {
	return `${raceId}_${horseId}`;
}

export function mapSearchHorse(h: ApiSearchHorse): ProviderHorse {
	return {
		providerHorseId: h.id,
		name: h.name,
		sire: h.sire ?? undefined,
		dam: h.dam ?? undefined,
		damsire: h.damsire ?? undefined,
		facts: mapHorseFacts(h),
	};
}

export function mapRacecardToEntries(
	rc: ApiRacecard,
	linkedHorseIds: Set<string>,
): ProviderEntry[] {
	return (rc.runners ?? [])
		.filter((r) => linkedHorseIds.has(r.horse_id))
		.map((r) => ({
			providerHorseId: r.horse_id,
			meeting: {
				providerMeetingId: `${rc.course_id}_${rc.date}`,
				providerCourseId: rc.course_id,
				courseName: rc.course,
				courseCountry: rc.region,
				date: new Date(rc.date),
			},
			race: {
				providerRaceId: rc.race_id,
				postTime: new Date(rc.off_dt),
				name: rc.race_name,
				raceType: rc.type,
				distanceFurlongs: roundFurlongs(num(rc.distance_f)),
				className: rc.race_class,
				goingDescription: rc.going,
			},
			entry: {
				providerEntryId: entryId(rc.race_id, r.horse_id),
				// FABLE_AUDIT C6 / S5-09 Task 1.5: The Racing API keeps withdrawn
				// runners on the racecard with number "NR" (the OpenAPI spec types
				// `number` as a plain string; this is per the API docs).
				// TODO(S5-09): confirm NR signal against live data.
				status:
					r.number?.toUpperCase() === "NR"
						? ("NON_RUNNER" as const)
						: ("DECLARED" as const),
				draw: num(r.draw),
				weightLbs: num(r.lbs),
				jockeyName: r.jockey,
				providerJockeyId: r.jockey_id,
				trainerName: r.trainer,
				providerTrainerId: r.trainer_id,
				trainerLocation: r.trainer_location?.trim() || undefined,
				horseFacts: mapHorseFacts(r),
			},
		}));
}

// ---------------------------------------------------------------------------
// GET /v1/horses/{id}/results — full career history for one horse.
// Field names differ from both racecards and /results (e.g. `dist_f` not
// `distance_f`/`distance_f`, `class` not `race_class`, `weight_lbs` not `lbs`).
// Money/odds fields (`prize`, `sp`, `sp_dec`, `bsp`) are present on the real
// payload but deliberately not typed or read here — out of scope per D37/spec.
// ---------------------------------------------------------------------------

export interface ApiHistoryRunner {
	horse_id: string;
	horse?: string;
	position?: string;
	btn?: string;
	or?: string;
	comment?: string;
	weight_lbs?: string;
	jockey?: string;
	jockey_claim_lbs?: string;
	jockey_id?: string;
	trainer?: string;
	trainer_id?: string;
	headgear?: string;
	time?: string;
}

export interface ApiHistoryRace {
	race_id: string;
	date: string;
	course: string;
	course_id: string;
	off?: string;
	off_dt: string;
	race_name?: string;
	type?: string;
	class?: string;
	dist_f?: string;
	going?: string;
	region?: string;
	runners?: ApiHistoryRunner[] | null;
}

export interface ApiHorseHistory {
	results?: ApiHistoryRace[] | null;
}

/** Field size = number of runners listed (non-runners live elsewhere). */
export function fieldSizeOf(runners: unknown[] | null | undefined): number | undefined {
	return runners && runners.length > 0 ? runners.length : undefined;
}

export function mapHorseHistory(
	data: ApiHorseHistory,
	providerHorseId: string,
): ProviderHistoricalRun[] {
	const runs: ProviderHistoricalRun[] = [];

	for (const race of data.results ?? []) {
		const runner = (race.runners ?? []).find((r) => r.horse_id === providerHorseId);
		if (!runner) continue;

		runs.push({
			providerHorseId,
			meeting: {
				providerMeetingId: `${race.course_id}_${race.date}`,
				providerCourseId: race.course_id,
				courseName: race.course,
				courseCountry: race.region,
				date: new Date(race.date),
			},
			race: {
				providerRaceId: race.race_id,
				postTime: new Date(race.off_dt),
				name: race.race_name,
				raceType: race.type,
				distanceFurlongs: parseDistF(race.dist_f),
				className: race.class,
				goingDescription: race.going,
			},
			entry: {
				providerEntryId: entryId(race.race_id, providerHorseId),
				status: "RAN" as const,
				weightLbs: num(runner.weight_lbs),
				jockeyName: runner.jockey,
				providerJockeyId: runner.jockey_id,
				trainerName: runner.trainer,
				providerTrainerId: runner.trainer_id,
				fieldSize: fieldSizeOf(race.runners),
			},
			result: {
				finishingPosition: num(runner.position),
				beatenLengths: num(runner.btn),
				ratingAchieved: num(runner.or),
				timeformComment: runner.comment,
			},
		});
	}

	return runs;
}

export function mapResult(res: ApiResult): ProviderResult {
	return {
		providerRaceId: res.race_id,
		fieldSize: fieldSizeOf(res.runners),
		entries: (res.runners ?? []).map((r) => ({
			providerEntryId: entryId(res.race_id, r.horse_id),
			finishingPosition: num(r.position),
			beatenLengths: num(r.btn),
			ratingAchieved: num(r.or),
			timeformComment: r.comment,
		})),
	};
}
