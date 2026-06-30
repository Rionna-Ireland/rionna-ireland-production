/**
 * TheRacingApiProvider — live adapter for api.theracingapi.com.
 *
 * getEntriesForHorse has no per-horse endpoint, so it scans today+tomorrow
 * racecards (the UK/IRE declaration window) and filters by horse. Racecards
 * are memoized on the instance — one instance per cron tick (created per-org
 * in the orchestrator), so each date is fetched once regardless of horse count.
 *
 * @see Architecture/specs/S2-15-racing-data-horse-connection.md (Implementation shape)
 */

import { logger } from "@repo/logs";
import type {
	ProviderEntry,
	ProviderHorse,
	ProviderResult,
	RacingDataProvider,
} from "../types";
import type { RacingApiHttp } from "./http";
import {
	type ApiRacecard,
	type ApiResult,
	type ApiSearchHorse,
	mapRacecardToEntries,
	mapResult,
	mapSearchHorse,
} from "./map";

const REGION_QS = "region_codes=gb&region_codes=ire";

export class TheRacingApiProvider implements RacingDataProvider {
	private racecardCache = new Map<string, ApiRacecard[]>();

	constructor(private readonly http: RacingApiHttp) {}

	async searchHorses(query: string): Promise<ProviderHorse[]> {
		const q = query.trim();
		if (q.length === 0) return [];
		const data = await this.http.getJson<{ search_results: ApiSearchHorse[] }>(
			`/v1/horses/search?name=${encodeURIComponent(q)}`,
		);
		return (data.search_results ?? []).map(mapSearchHorse);
	}

	async getHorseProfile(providerHorseId: string): Promise<ProviderHorse> {
		const data = await this.http.getJson<ApiSearchHorse>(
			`/v1/horses/${encodeURIComponent(providerHorseId)}/standard`,
		);
		return mapSearchHorse(data);
	}

	async getEntriesForHorse(
		providerHorseId: string,
		_opts: { lookAheadDays: number },
	): Promise<ProviderEntry[]> {
		// Declaration window is today + tomorrow; lookAheadDays beyond that is
		// empty (declarations only publish ~24-48h out). See D37.
		// NOTE: instance memoization assumes the per-org ingest loop is sequential
		// (ingest-org.ts); parallelizing horses would double-fetch racecards.
		const linked = new Set([providerHorseId]);
		const cards = [
			...(await this.racecardsForDay("today")),
			...(await this.racecardsForDay("tomorrow")),
		];
		return cards.flatMap((rc) => mapRacecardToEntries(rc, linked));
	}

	async getRaceResult(providerRaceId: string): Promise<ProviderResult | null> {
		try {
			const data = await this.http.getJson<ApiResult>(
				`/v1/results/${encodeURIComponent(providerRaceId)}`,
			);
			return mapResult(data);
		} catch (error) {
			logger.warn(`Racing API getRaceResult failed for ${providerRaceId}`, {
				error,
			});
			return null;
		}
	}

	/** Memoized per-instance racecard fetch for one day. */
	private async racecardsForDay(
		day: "today" | "tomorrow",
	): Promise<ApiRacecard[]> {
		const cached = this.racecardCache.get(day);
		if (cached) return cached;
		const data = await this.http.getJson<{ racecards: ApiRacecard[] }>(
			`/v1/racecards/standard?day=${day}&${REGION_QS}`,
		);
		const cards = data.racecards ?? [];
		this.racecardCache.set(day, cards);
		return cards;
	}
}
