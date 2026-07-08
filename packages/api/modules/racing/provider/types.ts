/**
 * Racing Data Provider Interface
 *
 * Canonical interface for fetching racing data from external providers.
 * Decoupled from any specific data source's field names — the domain
 * layer never knows whether data comes from Timeform, The Racing API,
 * or a mock.
 *
 * @see Architecture/specs/S1-03-racing-data-provider.md
 */

export interface ProviderEntry {
  providerHorseId: string;
  meeting: {
    providerMeetingId: string;
    providerCourseId: string;
    courseName: string;
    courseCountry?: string;
    date: Date;
  };
  race: {
    providerRaceId: string;
    postTime: Date;
    name?: string;
    raceType?: string;
    distanceFurlongs?: number;
    className?: string;
    prizeMoney?: number;
    goingDescription?: string;
  };
  entry: {
    providerEntryId: string;
    status:
      | "ENTERED"
      | "DECLARED"
      | "NON_RUNNER"
      | "RAN"
      | "DISQUALIFIED"
      | "VOID";
    draw?: number;
    weightLbs?: number;
    jockeyName?: string;
    providerJockeyId?: string;
    trainerName?: string;
    providerTrainerId?: string;
  };
}

export interface ProviderResult {
  providerRaceId: string;
  entries: Array<{
    providerEntryId: string;
    finishingPosition?: number;
    beatenLengths?: number;
    ratingAchieved?: number;
    timeformComment?: string;
    performanceRating?: number; // premium tier only
    starRating?: number; // premium tier only
  }>;
}

/** Full past-race history for one horse (for backfill on link). */
export interface ProviderHistoricalRun extends ProviderEntry {
  result: {
    finishingPosition?: number;
    beatenLengths?: number;
    ratingAchieved?: number;
    timeformComment?: string;
  };
}

export interface ProviderHorse {
  providerHorseId: string;
  name: string;
  sire?: string;
  dam?: string;
  damsire?: string;
  trainerName?: string;
  providerTrainerId?: string;
  age?: number;
  colour?: string;
  sex?: string;
}

export interface RacingDataProvider {
  /** Upcoming entries for one horse */
  getEntriesForHorse(
    providerHorseId: string,
    opts: { lookAheadDays: number },
  ): Promise<ProviderEntry[]>;

  /** Post-race result for one race */
  getRaceResult(providerRaceId: string): Promise<ProviderResult | null>;

  /** Horse profile data for initial linking / enrichment */
  getHorseProfile(providerHorseId: string): Promise<ProviderHorse>;

  /** Search the provider's horse database by name (for admin linking) */
  searchHorses(query: string): Promise<ProviderHorse[]>;

  /** Full past-race history for one horse (for backfill on link). */
  getHorseHistory(providerHorseId: string): Promise<ProviderHistoricalRun[]>;
}
