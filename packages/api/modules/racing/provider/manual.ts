/**
 * Manual (no-op) Racing Data Provider
 *
 * For organizations with no external racing data provider configured.
 * Returns empty arrays for entries and null for results. Throws on
 * getHorseProfile since there is no data source to query.
 *
 * @see Architecture/specs/S1-03-racing-data-provider.md
 */

import type {
  RacingDataProvider,
  ProviderEntry,
  ProviderResult,
  ProviderHorse,
  ProviderHistoricalRun,
} from "./types";

export class ManualProvider implements RacingDataProvider {
  async getEntriesForHorse(
    _providerHorseId: string,
    _opts: { lookAheadDays: number },
  ): Promise<ProviderEntry[]> {
    return [];
  }

  async getRaceResult(
    _providerRaceId: string,
  ): Promise<ProviderResult | null> {
    return null;
  }

  async getHorseProfile(_providerHorseId: string): Promise<ProviderHorse> {
    throw new Error("Manual provider has no horse profiles");
  }

  async searchHorses(_query: string): Promise<ProviderHorse[]> {
    return [];
  }

  async getHorseHistory(
    _providerHorseId: string,
  ): Promise<ProviderHistoricalRun[]> {
    return [];
  }
}
