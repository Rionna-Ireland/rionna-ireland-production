/**
 * S1-03: Racing Data Provider Tests
 *
 * Covers:
 * - RacingDataProvider interface compliance (MockRacingDataProvider implements all three methods)
 * - Time-based status transitions: ENTERED (>24h), DECLARED (<24h), RAN (past)
 * - Non-runner entries preserve NON_RUNNER status regardless of time
 * - getRaceResult returns null for future races
 * - ManualProvider returns empty arrays and null without errors
 * - ManualProvider throws on getHorseProfile
 * - Mock fixtures correctness (5 horses, 3 meetings, 8 races, 1 non-runner)
 * - Factory function returns correct provider types
 *
 * @see Architecture/specs/S1-03-racing-data-provider.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockRacingDataProvider } from "../mock";
import { ManualProvider } from "../manual";
import { createRacingProvider } from "../index";
import { mockFixtures } from "../mock-fixtures";
import { TheRacingApiProvider } from "../racing-api";
import type { RacingDataProvider } from "../types";

// ---------------------------------------------------------------------------
// Mock fixtures correctness
// ---------------------------------------------------------------------------

describe("Mock fixtures", () => {
  it("contains exactly 5 horses", () => {
    expect(mockFixtures.horses).toHaveLength(5);
  });

  it("contains exactly 8 races", () => {
    expect(mockFixtures.races).toHaveLength(8);
  });

  it("contains exactly 1 non-runner entry across all horses", () => {
    const nonRunners = mockFixtures.horses.flatMap((h) =>
      h.entries.filter((e) => e.entry.status === "NON_RUNNER"),
    );
    expect(nonRunners).toHaveLength(1);
  });

  it("entries span 3 distinct meetings", () => {
    const meetingIds = new Set(
      mockFixtures.horses.flatMap((h) =>
        h.entries.map((e) => e.meeting.providerMeetingId),
      ),
    );
    expect(meetingIds.size).toBe(3);
  });

  it("all 5 horses have unique providerHorseIds", () => {
    const ids = mockFixtures.horses.map((h) => h.providerHorseId);
    expect(new Set(ids).size).toBe(5);
  });

  it("all 8 races have unique providerRaceIds", () => {
    const ids = mockFixtures.races.map((r) => r.providerRaceId);
    expect(new Set(ids).size).toBe(8);
  });

  it("fixtures include a dead-heat result (race-003 has two entries at position 1)", () => {
    const race003 = mockFixtures.races.find(
      (r) => r.providerRaceId === "mock-race-003",
    );
    expect(race003?.result).not.toBeNull();
    const winners = race003!.result!.entries.filter(
      (e) => e.finishingPosition === 1,
    );
    expect(winners).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// RacingDataProvider interface compliance
// ---------------------------------------------------------------------------

describe("MockRacingDataProvider interface compliance", () => {
  it("implements getEntriesForHorse", () => {
    const provider: RacingDataProvider = new MockRacingDataProvider();
    expect(typeof provider.getEntriesForHorse).toBe("function");
  });

  it("implements getRaceResult", () => {
    const provider: RacingDataProvider = new MockRacingDataProvider();
    expect(typeof provider.getRaceResult).toBe("function");
  });

  it("implements getHorseProfile", () => {
    const provider: RacingDataProvider = new MockRacingDataProvider();
    expect(typeof provider.getHorseProfile).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Time-based status transitions
// ---------------------------------------------------------------------------

describe("MockRacingDataProvider — time-based status transitions", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ENTERED status when postTime is >24h in the future", async () => {
    // Fixtures compute dates at import time using real Date.now(), so fake
    // timers would desync. Instead, rely on the fixture design: Cheltenham
    // races are ~74-76h in the future, so they will always be ENTERED.
    const provider = new MockRacingDataProvider();
    const entries = await provider.getEntriesForHorse("mock-horse-001", {
      lookAheadDays: 30,
    });
    const enteredEntries = entries.filter((e) => e.entry.status === "ENTERED");
    // Pink Jasmine has a Cheltenham entry (race-008, ~76h out) — should be ENTERED
    expect(enteredEntries.length).toBeGreaterThan(0);
    for (const e of enteredEntries) {
      expect(e.entry.status).toBe("ENTERED");
    }
  });

  it("returns DECLARED status when postTime is <24h but still in the future", async () => {
    const provider = new MockRacingDataProvider();
    // We use real timers and ask for entries within a large lookAhead window.
    // Curragh race-005 is 2h from now — that should be DECLARED.
    const entries = await provider.getEntriesForHorse("mock-horse-001", {
      lookAheadDays: 30,
    });
    const declared = entries.filter((e) => e.entry.status === "DECLARED");
    // Pink Jasmine has race-005 at Curragh (2h ahead) — should appear as DECLARED
    expect(declared.length).toBeGreaterThan(0);
    for (const e of declared) {
      expect(e.entry.status).toBe("DECLARED");
    }
  });

  it("returns RAN status for entries whose postTime is in the past", async () => {
    const provider = new MockRacingDataProvider();
    // Pink Jasmine ran at Leopardstown (race-001, 50h ago)
    const entries = await provider.getEntriesForHorse("mock-horse-001", {
      lookAheadDays: 30,
    });
    const ran = entries.filter((e) => e.entry.status === "RAN");
    expect(ran.length).toBeGreaterThan(0);
    for (const e of ran) {
      expect(e.entry.status).toBe("RAN");
    }
  });

  it("all three statuses appear across a horse with past, near-future, and far-future entries", async () => {
    // Pink Jasmine: past (Leopardstown -50h), near-future (<24h, Curragh +2h), far-future (Cheltenham +76h)
    const provider = new MockRacingDataProvider();
    const entries = await provider.getEntriesForHorse("mock-horse-001", {
      lookAheadDays: 30,
    });
    const statuses = new Set(entries.map((e) => e.entry.status));
    expect(statuses.has("RAN")).toBe(true);
    expect(statuses.has("DECLARED")).toBe(true);
    expect(statuses.has("ENTERED")).toBe(true);
  });

  it("uses an explicit fake time to pin ENTERED/DECLARED/RAN behaviour", async () => {
    // Fix time to a known reference point, then manually construct expectations
    // based on the relative offsets in mock-fixtures.ts.
    const fakeNow = new Date("2026-06-01T10:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);

    const provider = new MockRacingDataProvider();
    const entries = await provider.getEntriesForHorse("mock-horse-001", {
      lookAheadDays: 30,
    });

    for (const e of entries) {
      const postTime = new Date(e.race.postTime);
      const hoursUntil =
        (postTime.getTime() - fakeNow.getTime()) / (1000 * 60 * 60);

      if (e.entry.status === "NON_RUNNER") continue; // skip non-runner check here

      if (hoursUntil > 24) {
        expect(e.entry.status).toBe("ENTERED");
      } else if (hoursUntil > 0) {
        expect(e.entry.status).toBe("DECLARED");
      } else {
        expect(e.entry.status).toBe("RAN");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Non-runner preservation
// ---------------------------------------------------------------------------

describe("MockRacingDataProvider — non-runner preservation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves NON_RUNNER status regardless of time (future race)", async () => {
    const provider = new MockRacingDataProvider();
    // Emerald Dream (horse-003) has a NON_RUNNER for race-006 (Curragh Maiden, +5h)
    const entries = await provider.getEntriesForHorse("mock-horse-003", {
      lookAheadDays: 30,
    });
    const nonRunner = entries.find(
      (e) => e.race.providerRaceId === "mock-race-006",
    );
    expect(nonRunner).toBeDefined();
    expect(nonRunner!.entry.status).toBe("NON_RUNNER");
  });

  it("NON_RUNNER entry would NOT be DECLARED/RAN even though postTime is <24h", async () => {
    // race-006 postTime = +5h from now, which would normally be DECLARED,
    // but the NON_RUNNER fixture override should prevail.
    const provider = new MockRacingDataProvider();
    const entries = await provider.getEntriesForHorse("mock-horse-003", {
      lookAheadDays: 30,
    });
    const nonRunner = entries.find(
      (e) => e.race.providerRaceId === "mock-race-006",
    );
    expect(nonRunner?.entry.status).toBe("NON_RUNNER");
    expect(nonRunner?.entry.status).not.toBe("DECLARED");
  });
});

// ---------------------------------------------------------------------------
// getRaceResult — only past races return results
// ---------------------------------------------------------------------------

describe("MockRacingDataProvider — getRaceResult", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a ProviderResult for a past race (mock-race-001)", async () => {
    const provider = new MockRacingDataProvider();
    const result = await provider.getRaceResult("mock-race-001");
    expect(result).not.toBeNull();
    expect(result!.providerRaceId).toBe("mock-race-001");
    expect(result!.entries.length).toBeGreaterThan(0);
  });

  it("returns null for a future race (mock-race-007)", async () => {
    const provider = new MockRacingDataProvider();
    const result = await provider.getRaceResult("mock-race-007");
    expect(result).toBeNull();
  });

  it("returns null for a future race (mock-race-008)", async () => {
    const provider = new MockRacingDataProvider();
    const result = await provider.getRaceResult("mock-race-008");
    expect(result).toBeNull();
  });

  it("returns null for an unknown race ID", async () => {
    const provider = new MockRacingDataProvider();
    const result = await provider.getRaceResult("mock-race-does-not-exist");
    expect(result).toBeNull();
  });

  it("returns the dead-heat result for mock-race-003", async () => {
    const provider = new MockRacingDataProvider();
    const result = await provider.getRaceResult("mock-race-003");
    expect(result).not.toBeNull();
    const firstPlaceEntries = result!.entries.filter(
      (e) => e.finishingPosition === 1,
    );
    expect(firstPlaceEntries).toHaveLength(2);
  });

  it("all four past races (001-004) return results", async () => {
    const provider = new MockRacingDataProvider();
    for (const raceId of [
      "mock-race-001",
      "mock-race-002",
      "mock-race-003",
      "mock-race-004",
    ]) {
      const result = await provider.getRaceResult(raceId);
      expect(result).not.toBeNull();
    }
  });

  it("all four future races (005-008) return null", async () => {
    const provider = new MockRacingDataProvider();
    for (const raceId of [
      "mock-race-005",
      "mock-race-006",
      "mock-race-007",
      "mock-race-008",
    ]) {
      const result = await provider.getRaceResult(raceId);
      expect(result).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// getHorseProfile
// ---------------------------------------------------------------------------

describe("MockRacingDataProvider — getHorseProfile", () => {
  it("returns a ProviderHorse for a known horse", async () => {
    const provider = new MockRacingDataProvider();
    const profile = await provider.getHorseProfile("mock-horse-001");
    expect(profile.providerHorseId).toBe("mock-horse-001");
    expect(profile.name).toBe("Pink Jasmine");
  });

  it("throws for an unknown horse ID", async () => {
    const provider = new MockRacingDataProvider();
    await expect(
      provider.getHorseProfile("mock-horse-not-found"),
    ).rejects.toThrow("mock-horse-not-found");
  });

  it("returns profiles for all 5 horses without error", async () => {
    const provider = new MockRacingDataProvider();
    const ids = mockFixtures.horses.map((h) => h.providerHorseId);
    for (const id of ids) {
      const profile = await provider.getHorseProfile(id);
      expect(profile.providerHorseId).toBe(id);
      expect(typeof profile.name).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// getEntriesForHorse — general behaviour
// ---------------------------------------------------------------------------

describe("MockRacingDataProvider — getEntriesForHorse", () => {
  it("returns empty array for an unknown horse ID", async () => {
    const provider = new MockRacingDataProvider();
    const entries = await provider.getEntriesForHorse(
      "mock-horse-not-found",
      { lookAheadDays: 30 },
    );
    expect(entries).toEqual([]);
  });

  it("respects lookAheadDays — excludes entries beyond the window", async () => {
    const provider = new MockRacingDataProvider();
    // lookAheadDays=1 — only entries within 24h from now should appear
    // Cheltenham races are 74h/76h from now, so they must NOT appear
    const narrowEntries = await provider.getEntriesForHorse("mock-horse-001", {
      lookAheadDays: 1,
    });
    const cheltenhamEntries = narrowEntries.filter((e) =>
      e.race.providerRaceId.startsWith("mock-race-007") || e.race.providerRaceId.startsWith("mock-race-008"),
    );
    expect(cheltenhamEntries).toHaveLength(0);
  });

  it("includes entries beyond lookAheadDays window when window is large", async () => {
    const provider = new MockRacingDataProvider();
    const wideEntries = await provider.getEntriesForHorse("mock-horse-001", {
      lookAheadDays: 30,
    });
    expect(wideEntries.length).toBeGreaterThan(0);
  });

  it("returned entries have the correct shape (providerHorseId, meeting, race, entry)", async () => {
    const provider = new MockRacingDataProvider();
    const entries = await provider.getEntriesForHorse("mock-horse-001", {
      lookAheadDays: 30,
    });
    for (const e of entries) {
      expect(e).toHaveProperty("providerHorseId");
      expect(e).toHaveProperty("meeting");
      expect(e).toHaveProperty("race");
      expect(e).toHaveProperty("entry");
      expect(e.meeting).toHaveProperty("providerMeetingId");
      expect(e.meeting).toHaveProperty("providerCourseId");
      expect(e.race).toHaveProperty("providerRaceId");
      expect(e.race).toHaveProperty("postTime");
      expect(e.entry).toHaveProperty("providerEntryId");
      expect(e.entry).toHaveProperty("status");
    }
  });
});

// ---------------------------------------------------------------------------
// ManualProvider
// ---------------------------------------------------------------------------

describe("ManualProvider", () => {
  it("implements RacingDataProvider interface", () => {
    const provider: RacingDataProvider = new ManualProvider();
    expect(typeof provider.getEntriesForHorse).toBe("function");
    expect(typeof provider.getRaceResult).toBe("function");
    expect(typeof provider.getHorseProfile).toBe("function");
  });

  it("getEntriesForHorse returns an empty array", async () => {
    const provider = new ManualProvider();
    const result = await provider.getEntriesForHorse("any-horse-id", {
      lookAheadDays: 30,
    });
    expect(result).toEqual([]);
  });

  it("getRaceResult returns null", async () => {
    const provider = new ManualProvider();
    const result = await provider.getRaceResult("any-race-id");
    expect(result).toBeNull();
  });

  it("getHorseProfile throws with a descriptive error", async () => {
    const provider = new ManualProvider();
    await expect(provider.getHorseProfile("any-horse-id")).rejects.toThrow(
      "Manual provider has no horse profiles",
    );
  });

  it("does not throw for getEntriesForHorse with any input", async () => {
    const provider = new ManualProvider();
    await expect(
      provider.getEntriesForHorse("", { lookAheadDays: 0 }),
    ).resolves.toEqual([]);
  });

  it("does not throw for getRaceResult with any input", async () => {
    const provider = new ManualProvider();
    await expect(provider.getRaceResult("")).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Factory function — createRacingProvider
// ---------------------------------------------------------------------------

describe("createRacingProvider factory", () => {
  it("returns a MockRacingDataProvider for 'mock'", () => {
    const provider = createRacingProvider("mock");
    expect(provider).toBeInstanceOf(MockRacingDataProvider);
  });

  it("returns a ManualProvider for 'manual'", () => {
    const provider = createRacingProvider("manual");
    expect(provider).toBeInstanceOf(ManualProvider);
  });

  it("returned mock provider satisfies RacingDataProvider interface", async () => {
    const provider = createRacingProvider("mock");
    // Type-check via usage: should be callable without errors
    const entries = await provider.getEntriesForHorse("mock-horse-001", {
      lookAheadDays: 1,
    });
    expect(Array.isArray(entries)).toBe(true);
  });

  it("returned manual provider satisfies RacingDataProvider interface", async () => {
    const provider = createRacingProvider("manual");
    const entries = await provider.getEntriesForHorse("any-id", {
      lookAheadDays: 1,
    });
    expect(entries).toEqual([]);
  });

  it("unknown provider name falls back to ManualProvider", () => {
    // The factory's default branch returns ManualProvider.
    // Cast to bypass TypeScript to simulate a runtime unknown value.
    const provider = createRacingProvider("timeform" as "mock");
    expect(provider).toBeInstanceOf(ManualProvider);
  });
});

// ---------------------------------------------------------------------------
// searchHorses (S2-15 §3)
// ---------------------------------------------------------------------------

describe("MockRacingDataProvider — searchHorses", () => {
  it("returns matching horses by case-insensitive name substring", async () => {
    const provider = new MockRacingDataProvider();
    const results = await provider.searchHorses("pink");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((h) => h.name.toLowerCase().includes("pink"))).toBe(true);
  });

  it("returns an empty array when nothing matches", async () => {
    const provider = new MockRacingDataProvider();
    expect(await provider.searchHorses("zzzznomatch")).toEqual([]);
  });

  it("returns an empty array for a blank query", async () => {
    const provider = new MockRacingDataProvider();
    expect(await provider.searchHorses("  ")).toEqual([]);
  });
});

describe("ManualProvider — searchHorses", () => {
  it("returns an empty array", async () => {
    const provider = new ManualProvider();
    expect(await provider.searchHorses("anything")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createRacingProvider — racing_api
// ---------------------------------------------------------------------------

describe("createRacingProvider — racing_api", () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("returns a TheRacingApiProvider when env creds are present", () => {
    process.env.RACING_API_USER = "u";
    process.env.RACING_API_PASSWORD = "p";
    expect(createRacingProvider("racing_api")).toBeInstanceOf(TheRacingApiProvider);
  });

  it("falls back to ManualProvider when env creds are missing", () => {
    delete process.env.RACING_API_USER;
    delete process.env.RACING_API_PASSWORD;
    expect(createRacingProvider("racing_api")).toBeInstanceOf(ManualProvider);
  });
});
