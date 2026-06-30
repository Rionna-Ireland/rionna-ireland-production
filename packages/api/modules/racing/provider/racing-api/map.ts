/**
 * Pure mappers: The Racing API JSON -> RacingDataProvider domain types.
 *
 * Synthesized ids (the API has no entry/meeting id — see plan "Identifier
 * conventions"):
 *   providerMeetingId = `${course_id}_${date}`
 *   providerEntryId   = `${race_id}_${horse_id}`
 */

import type { ProviderEntry, ProviderHorse, ProviderResult } from "../types";

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
	runners: ApiRunner[];
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
	runners: ApiResultRunner[];
}

function num(v: string | undefined | null): number | undefined {
	if (v == null) {
		return undefined;
	}
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
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
	return rc.runners
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
				distanceFurlongs: num(rc.distance_f),
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

export function mapResult(res: ApiResult): ProviderResult {
	return {
		providerRaceId: res.race_id,
		entries: res.runners.map((r) => ({
			providerEntryId: entryId(res.race_id, r.horse_id),
			finishingPosition: num(r.position),
			beatenLengths: num(r.btn),
			ratingAchieved: num(r.or),
			timeformComment: r.comment,
		})),
	};
}
