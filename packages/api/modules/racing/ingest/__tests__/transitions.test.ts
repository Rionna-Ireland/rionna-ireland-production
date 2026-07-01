/**
 * S1-07: Status transition handler tests
 *
 * Tests the transition handler logic:
 * - Only DECLARED, NON_RUNNER, RAN fire pushes
 * - notifiedStates prevents duplicate pushes
 * - Horse.nextEntryId updated on DECLARED
 * - Horse.latestEntryId updated and nextEntryId cleared on RAN
 * - Non-push-worthy transitions (ENTERED, DISQUALIFIED, VOID) are ignored
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @repo/database
const mockRaceEntryUpdate = vi.fn().mockResolvedValue({});
const mockHorseUpdate = vi.fn().mockResolvedValue({});

vi.mock("@repo/database", () => ({
  db: {
    raceEntry: { update: (...args: unknown[]) => mockRaceEntryUpdate(...args) },
    horse: { update: (...args: unknown[]) => mockHorseUpdate(...args) },
  },
}));

// Mock sendPush
const mockSendPush = vi.fn().mockResolvedValue(undefined);
vi.mock("../send-push", () => ({
  sendPush: (...args: unknown[]) => mockSendPush(...args),
}));

// Mock postRaceUpdateToCircle
const mockPostToCircle = vi.fn().mockResolvedValue(undefined);
vi.mock("../post-to-circle", () => ({
  postRaceUpdateToCircle: (...args: unknown[]) => mockPostToCircle(...args),
}));

import { handleStatusTransition } from "../transitions";

const mockHorse = { id: "horse-1", name: "Pink Jasmine" };
const mockRace = {
  id: "race-1",
  name: "Leopardstown Maiden",
  postTime: new Date("2026-04-15T14:00:00Z"),
  courseName: "Leopardstown",
};

function makeEntry(
  status: string,
  notifiedStates: string[] = [],
  finishingPosition: number | null = null,
) {
  return {
    id: "entry-1",
    status: status as "DECLARED" | "NON_RUNNER" | "RAN",
    notifiedStates,
    finishingPosition,
  };
}

describe("handleStatusTransition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Push-worthy transitions ──────────────────────────────────────

  it("fires push for DECLARED transition", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("DECLARED"),
      "ENTERED",
    );
    expect(mockSendPush).toHaveBeenCalledOnce();
    expect(mockSendPush.mock.calls[0][0].triggerType).toBe("HORSE_DECLARED");
  });

  it("fires push for NON_RUNNER transition", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("NON_RUNNER"),
      "DECLARED",
    );
    expect(mockSendPush).toHaveBeenCalledOnce();
    expect(mockSendPush.mock.calls[0][0].triggerType).toBe("HORSE_NON_RUNNER");
  });

  it("fires push for RAN transition (winner)", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("RAN", [], 1),
      "DECLARED",
    );
    expect(mockSendPush).toHaveBeenCalledOnce();
    expect(mockSendPush.mock.calls[0][0].triggerType).toBe("RACE_RESULT");
  });

  // ── Non-push-worthy transitions ──────────────────────────────────

  it("does NOT fire push for ENTERED transition", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("ENTERED"),
      null,
    );
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("does NOT fire push for DISQUALIFIED transition", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("DISQUALIFIED"),
      "RAN",
    );
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("does NOT fire push for VOID transition", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("VOID"),
      "ENTERED",
    );
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  // ── notifiedStates idempotency ───────────────────────────────────

  it("does NOT fire duplicate push if DECLARED already in notifiedStates", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("DECLARED", ["DECLARED"]),
      "ENTERED",
    );
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("does NOT fire duplicate push if RAN already in notifiedStates", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("RAN", ["DECLARED", "RAN"], 2),
      "DECLARED",
    );
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("fires push for RAN even if DECLARED was already notified", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("RAN", ["DECLARED"], 3),
      "DECLARED",
    );
    expect(mockSendPush).toHaveBeenCalledOnce();
  });

  // ── notifiedStates is updated after push ─────────────────────────

  it("appends new status to notifiedStates after push", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("DECLARED"),
      "ENTERED",
    );
    expect(mockRaceEntryUpdate).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: { notifiedStates: ["DECLARED"] },
    });
  });

  it("preserves existing notifiedStates when appending", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("RAN", ["DECLARED"], 1),
      "DECLARED",
    );
    expect(mockRaceEntryUpdate).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: { notifiedStates: ["DECLARED", "RAN"] },
    });
  });

  // ── Horse denormalized fields ────────────────────────────────────

  it("sets Horse.nextEntryId on DECLARED", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("DECLARED"),
      "ENTERED",
    );
    expect(mockHorseUpdate).toHaveBeenCalledWith({
      where: { id: "horse-1" },
      data: { nextEntryId: "entry-1" },
    });
  });

  it("sets Horse.latestEntryId and clears nextEntryId on RAN", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("RAN", [], 2),
      "DECLARED",
    );
    expect(mockHorseUpdate).toHaveBeenCalledWith({
      where: { id: "horse-1" },
      data: { latestEntryId: "entry-1", nextEntryId: null },
    });
  });

  it("does NOT update Horse fields for NON_RUNNER", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("NON_RUNNER"),
      "DECLARED",
    );
    expect(mockHorseUpdate).not.toHaveBeenCalled();
  });

  // ── Circle posting (S6-08) ────────────────────────────────────────

  it("DECLARED both pushes and posts to Circle", async () => {
    await handleStatusTransition(
      "org-1",
      mockHorse,
      mockRace,
      makeEntry("DECLARED"),
      "ENTERED",
    );
    expect(mockSendPush).toHaveBeenCalledOnce();
    expect(mockPostToCircle).toHaveBeenCalledOnce();
    expect(mockPostToCircle.mock.calls[0][0]).toMatchObject({
      organizationId: "org-1",
      status: "DECLARED",
    });
  });

  it("already-notified bare status short-circuits both push and post", async () => {
    const entry = {
      id: "entry-1",
      status: "DECLARED" as const,
      notifiedStates: ["DECLARED"],
      finishingPosition: null,
    };
    await handleStatusTransition("org-1", mockHorse, mockRace, entry, "ENTERED");
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockPostToCircle).not.toHaveBeenCalled();
  });
});
