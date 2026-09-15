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

// Mock sendPush — default: delivered to a healthy audience.
const mockSendPush = vi.fn();
vi.mock("../send-push", () => ({
	sendPush: (...args: unknown[]) => mockSendPush(...args),
}));

// Mock postRaceUpdateToCircle
const mockPostToCircle = vi.fn().mockResolvedValue(undefined);
vi.mock("../post-to-circle", () => ({
	postRaceUpdateToCircle: (...args: unknown[]) => mockPostToCircle(...args),
}));

// Mock recordInbox — default: returns a badge map.
const mockRecordInbox = vi.fn();
vi.mock("../../../inbox/record", () => ({
	recordInbox: (...args: unknown[]) => mockRecordInbox(...args),
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
		mockSendPush.mockResolvedValue({ attempted: 3, sent: 3, failed: 0 });
		mockRecordInbox.mockResolvedValue(new Map([["user-1", 2]]));
	});

	// ── Inbox recording (S12-06a Task 6) ─────────────────────────────

	it("records a race_declared inbox item for DECLARED and passes the badge map to sendPush", async () => {
		await handleStatusTransition(
			"org-1",
			mockHorse,
			mockRace,
			makeEntry("DECLARED"),
			"ENTERED",
		);

		expect(mockRecordInbox).toHaveBeenCalledOnce();
		expect(mockRecordInbox.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			audience: { kind: "horseFollowers", horseId: "horse-1" },
			item: expect.objectContaining({
				kind: "race_declared",
				groupKey: "race_declared:entry-1",
				title: expect.any(String),
				body: expect.any(String),
				data: { screen: "horse", horseId: "horse-1" },
				refId: "entry-1",
				imageUrl: null,
			}),
		});

		expect(mockSendPush).toHaveBeenCalledOnce();
		expect(mockSendPush.mock.calls[0][0].badgeByUserId).toEqual(new Map([["user-1", 2]]));
	});

	it("records a race_non_runner inbox item for NON_RUNNER", async () => {
		await handleStatusTransition(
			"org-1",
			mockHorse,
			mockRace,
			makeEntry("NON_RUNNER"),
			"DECLARED",
		);

		expect(mockRecordInbox.mock.calls[0][0].item).toMatchObject({
			kind: "race_non_runner",
			groupKey: "race_non_runner:entry-1",
		});
	});

	it("records a race_result inbox item for RAN", async () => {
		await handleStatusTransition(
			"org-1",
			mockHorse,
			mockRace,
			makeEntry("RAN", [], 1),
			"DECLARED",
		);

		expect(mockRecordInbox.mock.calls[0][0].item).toMatchObject({
			kind: "race_result",
			groupKey: "race_result:entry-1",
		});
	});

	it("uses firstPhotoUrl(horse.photos) for imageUrl when photos are present", async () => {
		await handleStatusTransition(
			"org-1",
			{ ...mockHorse, photos: [{ url: "https://example.com/pic.jpg" }] },
			mockRace,
			makeEntry("DECLARED"),
			"ENTERED",
		);

		expect(mockRecordInbox.mock.calls[0][0].item.imageUrl).toBe(
			"https://example.com/pic.jpg",
		);
	});

	it("does NOT record an inbox item for an already-notified status (early return precedes the inbox write)", async () => {
		await handleStatusTransition(
			"org-1",
			mockHorse,
			mockRace,
			makeEntry("DECLARED", ["DECLARED"]),
			"ENTERED",
		);

		expect(mockRecordInbox).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	// ── Push delivery failure (FABLE_AUDIT C4) ───────────────────────

	it("throws (and does not mark notified) when the push failed for the whole audience", async () => {
		mockSendPush.mockResolvedValue({ attempted: 5, sent: 0, failed: 5 });

		await expect(
			handleStatusTransition("org-1", mockHorse, mockRace, makeEntry("DECLARED"), "ENTERED"),
		).rejects.toThrow(/push delivery failed/i);

		expect(mockRaceEntryUpdate).not.toHaveBeenCalled();
		expect(mockPostToCircle).not.toHaveBeenCalled();
	});

	it("marks notified on a partial delivery (no re-push to the successes)", async () => {
		mockSendPush.mockResolvedValue({ attempted: 5, sent: 3, failed: 2 });

		await handleStatusTransition(
			"org-1",
			mockHorse,
			mockRace,
			makeEntry("DECLARED"),
			"ENTERED",
		);

		expect(mockRaceEntryUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: { notifiedStates: ["DECLARED"] },
			}),
		);
	});

	it("marks notified when there was nothing to send (empty audience / all deduped)", async () => {
		mockSendPush.mockResolvedValue({ attempted: 0, sent: 0, failed: 0 });

		await handleStatusTransition(
			"org-1",
			mockHorse,
			mockRace,
			makeEntry("DECLARED"),
			"ENTERED",
		);

		expect(mockRaceEntryUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: { notifiedStates: ["DECLARED"] },
			}),
		);
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

	// ── Race push targeting (S8-03 §2 / C2) ──────────────────────────

	it("targets sendPush at the horse's followers for DECLARED", async () => {
		await handleStatusTransition(
			"org-1",
			mockHorse,
			mockRace,
			makeEntry("DECLARED"),
			"ENTERED",
		);
		expect(mockSendPush.mock.calls[0][0].followersOfHorseId).toBe("horse-1");
	});

	it("targets sendPush at the horse's followers for RAN", async () => {
		await handleStatusTransition(
			"org-1",
			mockHorse,
			mockRace,
			makeEntry("RAN", [], 1),
			"DECLARED",
		);
		expect(mockSendPush.mock.calls[0][0].followersOfHorseId).toBe("horse-1");
	});

	// ── Non-push-worthy transitions ──────────────────────────────────

	it("does NOT fire push for ENTERED transition", async () => {
		await handleStatusTransition("org-1", mockHorse, mockRace, makeEntry("ENTERED"), null);
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
		await handleStatusTransition("org-1", mockHorse, mockRace, makeEntry("VOID"), "ENTERED");
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

	it("passes fieldSize through to postRaceUpdateToCircle when provided", async () => {
		await handleStatusTransition(
			"org-1",
			mockHorse,
			mockRace,
			makeEntry("RAN", [], 4),
			"DECLARED",
			8,
		);
		expect(mockPostToCircle).toHaveBeenCalledOnce();
		expect(mockPostToCircle.mock.calls[0][0]).toMatchObject({
			fieldSize: 8,
		});
	});

	it("omits fieldSize from postRaceUpdateToCircle when not provided", async () => {
		await handleStatusTransition(
			"org-1",
			mockHorse,
			mockRace,
			makeEntry("RAN", [], 4),
			"DECLARED",
		);
		expect(mockPostToCircle).toHaveBeenCalledOnce();
		expect(mockPostToCircle.mock.calls[0][0].fieldSize).toBeUndefined();
	});
});
