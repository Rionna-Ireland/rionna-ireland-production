/**
 * Pure mappers: The Racing API JSON -> RacingDataProvider domain types.
 *
 * Synthesized ids (the API has no entry/meeting id — see plan "Identifier
 * conventions"):
 *   providerMeetingId = `${course_id}_${date}`
 *   providerEntryId   = `${race_id}_${horse_id}`
 */

import type {
	ProviderEntry,
	ProviderHistoricalRun,
	ProviderHorse,
	ProviderResult,
} from "../types";

export interface ApiSearchHorse {
	id: string;
	name: string;
	sire?: string | null;
	dam?: string | null;
	damsire?: string | null;
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
				status: "DECLARED" as const,
				draw: num(r.draw),
				weightLbs: num(r.lbs),
				jockeyName: r.jockey,
				providerJockeyId: r.jockey_id,
				trainerName: r.trainer,
				providerTrainerId: r.trainer_id,
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

export function mapHorseHistory(
	data: ApiHorseHistory,
	providerHorseId: string,
): ProviderHistoricalRun[] {
	const runs: ProviderHistoricalRun[] = [];

	for (const race of data.results ?? []) {
		const runner = (race.runners ?? []).find(
			(r) => r.horse_id === providerHorseId,
		);
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
		entries: (res.runners ?? []).map((r) => ({
			providerEntryId: entryId(res.race_id, r.horse_id),
			finishingPosition: num(r.position),
			beatenLengths: num(r.btn),
			ratingAchieved: num(r.or),
			timeformComment: r.comment,
		})),
	};
}
