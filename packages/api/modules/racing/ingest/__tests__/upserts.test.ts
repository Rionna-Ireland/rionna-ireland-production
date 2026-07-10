/**
 * S1-07: Upsert helper tests
 *
 * Verifies that course identity comes from provider course identity rather
 * than the mutable course name.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCourseUpsert = vi.fn().mockResolvedValue({ id: "course-1" });
const mockRaceEntryFindFirst = vi.fn();
const mockRaceEntryUpsert = vi.fn();

vi.mock("@repo/database", () => ({
  db: {
    course: {
      upsert: (...args: unknown[]) => mockCourseUpsert(...args),
    },
    raceEntry: {
      findFirst: (...args: unknown[]) => mockRaceEntryFindFirst(...args),
      upsert: (...args: unknown[]) => mockRaceEntryUpsert(...args),
    },
  },
}));

import { upsertCourse, upsertRaceEntry } from "../upserts";

describe("upsertCourse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses providerCourseId as the course providerEntityId", async () => {
    await upsertCourse("org-1", {
      providerMeetingId: "provider-meeting-123",
      providerCourseId: "provider-course-456",
      courseName: "Leopardstown",
      courseCountry: "IE",
      date: new Date("2026-04-13T09:00:00Z"),
    });

    expect(mockCourseUpsert).toHaveBeenCalledWith({
      where: {
        organizationId_providerEntityId: {
          organizationId: "org-1",
          providerEntityId: "provider-course-456",
        },
      },
      create: {
        organizationId: "org-1",
        providerEntityId: "provider-course-456",
        name: "Leopardstown",
        country: "IE",
      },
      update: {
        name: "Leopardstown",
      },
    });
  });
});

describe("upsertRaceEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseEntry = {
    providerEntryId: "provider-entry-1",
    draw: 4,
    weightLbs: 140,
    status: "DECLARED" as const,
  };

  function mockUpsertEcho() {
    // Simulate real upsert semantics: when a row already exists (the common
    // case exercised here via findFirst), only the `update` fields are
    // applied on top of the existing row — `create` fields are irrelevant.
    mockRaceEntryUpsert.mockImplementation(
      async (args: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existingRow = await mockRaceEntryFindFirst.mock.results[0]
          ?.value;
        const base = existingRow ?? { id: "entry-1", ...args.create };
        return {
          ...base,
          ...args.update,
        };
      },
    );
  }

  it("keeps status RAN when a stale DECLARED entry arrives for a RAN entry", async () => {
    mockRaceEntryFindFirst.mockResolvedValue({
      id: "entry-1",
      status: "RAN",
      finishingPosition: 4,
      draw: 2,
      weightLbs: 135,
    });
    mockUpsertEcho();

    const { raceEntry, previousStatus } = await upsertRaceEntry(
      "org-1",
      "horse-1",
      "race-1",
      undefined,
      null,
      baseEntry,
    );

    expect(raceEntry.status).toBe("RAN");
    expect(previousStatus).toBe("RAN");
  });

  it("keeps status NON_RUNNER when a stale DECLARED entry arrives for a NON_RUNNER entry", async () => {
    mockRaceEntryFindFirst.mockResolvedValue({
      id: "entry-1",
      status: "NON_RUNNER",
      finishingPosition: null,
      draw: 2,
      weightLbs: 135,
    });
    mockUpsertEcho();

    const { raceEntry, previousStatus } = await upsertRaceEntry(
      "org-1",
      "horse-1",
      "race-1",
      undefined,
      null,
      baseEntry,
    );

    expect(raceEntry.status).toBe("NON_RUNNER");
    expect(previousStatus).toBe("NON_RUNNER");
  });

  it("still updates draw/weight/jockey when the status write is skipped", async () => {
    mockRaceEntryFindFirst.mockResolvedValue({
      id: "entry-1",
      status: "RAN",
      finishingPosition: 4,
      draw: 2,
      weightLbs: 135,
    });
    mockUpsertEcho();

    await upsertRaceEntry("org-1", "horse-1", "race-1", "jockey-1", "trainer-1", {
      ...baseEntry,
      draw: 7,
      weightLbs: 142,
    });

    expect(mockRaceEntryUpsert).toHaveBeenCalledTimes(1);
    const call = mockRaceEntryUpsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty("status");
    expect(call.update.draw).toBe(7);
    expect(call.update.weightLbs).toBe(142);
    expect(call.update.jockeyId).toBe("jockey-1");
    expect(call.update.trainerId).toBe("trainer-1");
  });

  it("allows DECLARED to RAN upgrades", async () => {
    mockRaceEntryFindFirst.mockResolvedValue({
      id: "entry-1",
      status: "DECLARED",
      finishingPosition: null,
      draw: 2,
      weightLbs: 135,
    });
    mockUpsertEcho();

    const { raceEntry, previousStatus } = await upsertRaceEntry(
      "org-1",
      "horse-1",
      "race-1",
      undefined,
      null,
      { ...baseEntry, status: "RAN" },
    );

    expect(raceEntry.status).toBe("RAN");
    expect(previousStatus).toBe("DECLARED");
    const call = mockRaceEntryUpsert.mock.calls[0][0];
    expect(call.update.status).toBe("RAN");
  });

  it("allows DECLARED to NON_RUNNER upgrades", async () => {
    mockRaceEntryFindFirst.mockResolvedValue({
      id: "entry-1",
      status: "DECLARED",
      finishingPosition: null,
      draw: 2,
      weightLbs: 135,
    });
    mockUpsertEcho();

    const { raceEntry, previousStatus } = await upsertRaceEntry(
      "org-1",
      "horse-1",
      "race-1",
      undefined,
      null,
      { ...baseEntry, status: "NON_RUNNER" },
    );

    expect(raceEntry.status).toBe("NON_RUNNER");
    expect(previousStatus).toBe("DECLARED");
    const call = mockRaceEntryUpsert.mock.calls[0][0];
    expect(call.update.status).toBe("NON_RUNNER");
  });
});
