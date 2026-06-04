/**
 * S1-07: Orchestrator and per-org resilience tests
 *
 * Tests:
 * - Multi-org loop only processes orgs with a racing provider
 * - Per-org resilience: one org failing doesn't block others
 * - Per-horse resilience: one horse failing doesn't block others
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @repo/database ────────────────────────────────────────────

const mockOrgFindMany = vi.fn();
const mockHorseFindMany = vi.fn();
const mockHorseUpdate = vi.fn().mockResolvedValue({});
const mockRaceFindMany = vi.fn().mockResolvedValue([]);
const mockCourseUpsert = vi.fn().mockResolvedValue({ id: "c1", name: "Test" });
const mockMeetingUpsert = vi.fn().mockResolvedValue({ id: "m1" });
const mockRaceUpsert = vi
  .fn()
  .mockResolvedValue({ id: "r1", name: "Test", postTime: new Date() });
const mockJockeyUpsert = vi.fn().mockResolvedValue({ id: "j1" });
const mockRaceEntryFindFirst = vi.fn().mockResolvedValue(null);
const mockRaceEntryUpsert = vi.fn().mockResolvedValue({
  id: "re1",
  status: "ENTERED",
  notifiedStates: [],
  finishingPosition: null,
});
const mockRaceEntryUpdate = vi.fn().mockResolvedValue({});

vi.mock("@repo/database", () => ({
  db: {
    organization: { findMany: () => mockOrgFindMany() },
    horse: {
      findMany: (...args: unknown[]) => mockHorseFindMany(...args),
      update: (...args: unknown[]) => mockHorseUpdate(...args),
    },
    course: { upsert: (...args: unknown[]) => mockCourseUpsert(...args) },
    meeting: { upsert: (...args: unknown[]) => mockMeetingUpsert(...args) },
    race: {
      upsert: (...args: unknown[]) => mockRaceUpsert(...args),
      findMany: (...args: unknown[]) => mockRaceFindMany(...args),
    },
    jockey: { upsert: (...args: unknown[]) => mockJockeyUpsert(...args) },
    raceEntry: {
      findFirst: (...args: unknown[]) => mockRaceEntryFindFirst(...args),
      upsert: (...args: unknown[]) => mockRaceEntryUpsert(...args),
      update: (...args: unknown[]) => mockRaceEntryUpdate(...args),
    },
  },
}));

vi.mock("@repo/database/types", () => ({
  parseOrgMetadata: (raw: string | null) => {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  },
}));

vi.mock("@repo/logs", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../send-push", () => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
}));

import { runIngestForAllOrgs } from "../orchestrator";
import { ingestForOrg } from "../ingest-org";
import { MockRacingDataProvider } from "../../provider/mock";

describe("runIngestForAllOrgs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes orgs with a racing provider", async () => {
    mockOrgFindMany.mockResolvedValue([
      {
        id: "org-1",
        slug: "rionna",
        metadata: JSON.stringify({ racing: { provider: "mock" } }),
      },
    ]);
    mockHorseFindMany.mockResolvedValue([]);

    await runIngestForAllOrgs();

    expect(mockHorseFindMany).toHaveBeenCalled();
  });

  it("skips orgs without a racing provider", async () => {
    mockOrgFindMany.mockResolvedValue([
      {
        id: "org-1",
        slug: "no-racing-org",
        metadata: JSON.stringify({}),
      },
      {
        id: "org-2",
        slug: "null-metadata-org",
        metadata: null,
      },
    ]);

    await runIngestForAllOrgs();

    expect(mockHorseFindMany).not.toHaveBeenCalled();
  });

  it("continues to next org if one org fails (per-org resilience)", async () => {
    mockOrgFindMany.mockResolvedValue([
      {
        id: "org-fail",
        slug: "failing-org",
        metadata: JSON.stringify({ racing: { provider: "mock" } }),
      },
      {
        id: "org-ok",
        slug: "working-org",
        metadata: JSON.stringify({ racing: { provider: "mock" } }),
      },
    ]);

    // First call (org-fail) throws, second call (org-ok) succeeds
    let callCount = 0;
    mockHorseFindMany.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error("DB connection failed");
      return [];
    });

    await runIngestForAllOrgs();

    // Should have attempted both orgs
    expect(callCount).toBe(2);
  });
});

describe("ingestForOrg — per-horse resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues to next horse if one horse fails", async () => {
    const provider = new MockRacingDataProvider();
    const getEntriesSpy = vi.spyOn(provider, "getEntriesForHorse");

    mockHorseFindMany.mockResolvedValue([
      {
        id: "h1",
        name: "Failing Horse",
        providerEntityId: "mock-horse-fail",
        trainerId: null,
      },
      {
        id: "h2",
        name: "OK Horse",
        providerEntityId: "mock-horse-001",
        trainerId: null,
      },
    ]);

    // First horse: provider throws. Second horse: works normally.
    let callCount = 0;
    getEntriesSpy.mockImplementation(async (horseId, opts) => {
      callCount++;
      if (callCount === 1) throw new Error("Provider timeout");
      return []; // return empty for second horse to keep test simple
    });

    await ingestForOrg("org-1", provider);

    // Both horses were attempted
    expect(callCount).toBe(2);
  });

  it("queries DB for horses with providerEntityId not null", async () => {
    const provider = new MockRacingDataProvider();

    mockHorseFindMany.mockResolvedValue([]);

    await ingestForOrg("org-1", provider);

    // Verify the DB query filters for providerEntityId: { not: null }
    expect(mockHorseFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        providerEntityId: { not: null },
      },
    });
  });
});
