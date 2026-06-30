/**
 * Racing Data Provider factory
 *
 * Returns the correct RacingDataProvider implementation based on the
 * provider name stored in Organization.metadata.racing.provider.
 *
 * @see Architecture/specs/S1-03-racing-data-provider.md
 */

import type { RacingDataProvider } from "./types";
import { MockRacingDataProvider } from "./mock";
import { ManualProvider } from "./manual";
import { RacingApiHttp } from "./racing-api/http";
import { TheRacingApiProvider } from "./racing-api";
// import { TimeformProvider } from "./timeform";     // future

export type ProviderName = "mock" | "timeform" | "racing_api" | "manual";

export function createRacingProvider(
  providerName: ProviderName,
): RacingDataProvider {
  switch (providerName) {
    case "mock":
      return new MockRacingDataProvider();
    case "manual":
      return new ManualProvider();
    case "racing_api": {
      const username = process.env.RACING_API_USER;
      const password = process.env.RACING_API_PASSWORD;
      if (!username || !password) return new ManualProvider();
      return new TheRacingApiProvider(new RacingApiHttp({ username, password }));
    }
    // case "timeform":
    //   return new TimeformProvider(apiKey);
    default:
      return new ManualProvider();
  }
}

export type {
  RacingDataProvider,
  ProviderEntry,
  ProviderResult,
  ProviderHorse,
} from "./types";
export { MockRacingDataProvider } from "./mock";
export { ManualProvider } from "./manual";
export { TheRacingApiProvider } from "./racing-api";
