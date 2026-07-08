/**
 * Mock Racing Data Provider
 *
 * Returns deterministic test data from mock-fixtures.ts.
 * Entry status progresses based on the current time relative to postTime:
 *   - postTime > 24h from now  -> ENTERED
 *   - postTime < 24h from now  -> DECLARED
 *   - postTime in the past     -> RAN
 *
 * Non-runner entries keep their NON_RUNNER status regardless of time.
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
import { mockFixtures } from "./mock-fixtures";

export class MockRacingDataProvider implements RacingDataProvider {
  async getEntriesForHorse(
    providerHorseId: string,
    opts: { lookAheadDays: number },
  ): Promise<ProviderEntry[]> {
    const horse = mockFixtures.horses.find(
      (h) => h.providerHorseId === providerHorseId,
    );
    if (!horse) return [];

    const now = new Date();
    const lookAhead = new Date(
      now.getTime() + opts.lookAheadDays * 24 * 60 * 60 * 1000,
    );

    return horse.entries
      .filter((e) => new Date(e.race.postTime) <= lookAhead)
      .map((e) => ({
        ...e,
        entry: {
          ...e.entry,
          status:
            e.entry.status === "NON_RUNNER"
              ? ("NON_RUNNER" as const)
              : this.deriveStatus(new Date(e.race.postTime), now),
        },
      }));
  }

  async getRaceResult(providerRaceId: string): Promise<ProviderResult | null> {
    const race = mockFixtures.races.find(
      (r) => r.providerRaceId === providerRaceId,
    );
    if (!race) return null;

    // Only return results for races in the past
    if (new Date(race.postTime) > new Date()) return null;

    return race.result ?? null;
  }

  async getHorseProfile(providerHorseId: string): Promise<ProviderHorse> {
    const horse = mockFixtures.horses.find(
      (h) => h.providerHorseId === providerHorseId,
    );
    if (!horse) {
      throw new Error(`Mock horse ${providerHorseId} not found`);
    }
    return horse.profile;
  }

  async searchHorses(query: string): Promise<ProviderHorse[]> {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];
    return mockFixtures.horses
      .map((h) => h.profile)
      .filter((p) => p.name.toLowerCase().includes(q));
  }

  /** No fixture data for career history — mock org has nothing to backfill. */
  async getHorseHistory(
    _providerHorseId: string,
  ): Promise<ProviderHistoricalRun[]> {
    return [];
  }

  private deriveStatus(
    postTime: Date,
    now: Date,
  ): ProviderEntry["entry"]["status"] {
    const hoursUntil =
      (postTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil > 24) return "ENTERED";
    if (hoursUntil > 0) return "DECLARED";
    return "RAN";
  }
}
