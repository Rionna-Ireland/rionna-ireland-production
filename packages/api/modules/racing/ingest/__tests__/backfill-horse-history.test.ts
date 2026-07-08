/**
 * S8-02: Horse race history backfill tests
 *
 * Verifies career history is upserted as RAN entries with notifiedStates
 * pre-seeded so no future code path pushes or Circle-posts a historical
 * run, and that re-running backfill against a live-ingested entry never
 * regresses its status or overwrites its notifiedStates.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRaceEntryFindFirst = vi.fn();
const mockRaceEntryCreate = vi.fn().mockResolvedValue({});
const mockRaceEntryUpdate = vi.fn().mockResolvedValue({});

vi.mock("@repo/database", () => ({
	db: {
		raceEntry: {
			findFirst: (...args: unknown[]) => mockRaceEntryFindFirst(...args),
			create: (...args: unknown[]) => mockRaceEntryCreate(...args),
			update: (...args: unknown[]) => mockRaceEntryUpdate(...args),
		},
	},
}));

vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

const mockUpsertCourse = vi.fn().mockResolvedValue({ id: "course-1", name: "Ascot" });
const mockUpsertMeeting = vi.fn().mockResolvedValue({ id: "meeting-1" });
const mockUpsertRace = vi.fn().mockResolvedValue({ id: "race-1" });
const mockUpsertJockey = vi.fn().mockResolvedValue({ id: "jockey-1" });

vi.mock("../upserts", () => ({
	upsertCourse: (...args: unknown[]) => mockUpsertCourse(...args),
	upsertMeeting: (...args: unknown[]) => mockUpsertMeeting(...args),
	upsertRace: (...args: unknown[]) => mockUpsertRace(...args),
	upsertJockey: (...args: unknown[]) => mockUpsertJockey(...args),
}));

import { backfillHorseHistory } from "../backfill-horse-history";

const horse = {
	id: "horse-1",
	name: "Pink Jasmine",
	providerEntityId: "hrs_45568460",
	trainerId: "trainer-1",
};

function makeRun(overrides?: Record<string, unknown>) {
	return {
		providerHorseId: "hrs_45568460",
		meeting: {
			providerMeetingId: "crs_5_2025-05-10",
			providerCourseId: "crs_5",
			courseName: "Ascot",
			courseCountry: "GB",
			date: new Date("2025-05-10T00:00:00Z"),
		},
		race: {
			providerRaceId: "rac_9",
			postTime: new Date("2025-05-10T18:20:00Z"),
			name: "Test Handicap",
			distanceFurlongs: 22,
			goingDescription: "Good",
		},
		entry: {
			providerEntryId: "rac_9_hrs_45568460",
			status: "RAN" as const,
			weightLbs: 133,
			jockeyName: "P Bradley",
			providerJockeyId: "jky_1",
			trainerName: "Jim & Suzi Best",
			providerTrainerId: "trn_1",
		},
		result: {
			finishingPosition: 1,
			beatenLengths: 0,
			ratingAchieved: 75,
			timeformComment: "stayed on",
		},
		...overrides,
	};
}

describe("backfillHorseHistory", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns a zeroed summary and skips the fetch when the horse has no providerEntityId", async () => {
		const provider = { getHorseHistory: vi.fn() };
		const summary = await backfillHorseHistory(
			"org-1",
			{ ...horse, providerEntityId: null },
			provider as never,
		);
		expect(summary).toEqual({ created: 0, skipped: 0, failed: 0 });
		expect(provider.getHorseHistory).not.toHaveBeenCalled();
	});

	it("creates a RAN entry with notifiedStates pre-seeded so nothing can notify on it", async () => {
		const provider = { getHorseHistory: vi.fn().mockResolvedValue([makeRun()]) };
		mockRaceEntryFindFirst.mockResolvedValue(null);

		const summary = await backfillHorseHistory("org-1", horse, provider as never);

		expect(summary).toEqual({ created: 1, skipped: 0, failed: 0 });
		expect(mockRaceEntryCreate).toHaveBeenCalledWith({
			data: {
				organizationId: "org-1",
				providerEntityId: "rac_9_hrs_45568460",
				horseId: "horse-1",
				raceId: "race-1",
				status: "RAN",
				weightLbs: 133,
				jockeyId: "jockey-1",
				trainerId: "trainer-1",
				finishingPosition: 1,
				beatenLengths: 0,
				ratingAchieved: 75,
				timeformComment: "stayed on",
				notifiedStates: [
					"DECLARED",
					"RAN",
					"NON_RUNNER",
					"circle:DECLARED",
					"circle:RAN",
				],
			},
		});
	});

	it("is idempotent: running twice against the same run does not create a duplicate", async () => {
		const provider = { getHorseHistory: vi.fn().mockResolvedValue([makeRun()]) };
		mockRaceEntryFindFirst.mockResolvedValue({
			id: "existing-entry",
			status: "RAN",
			finishingPosition: 1,
			beatenLengths: 0,
			ratingAchieved: 75,
			timeformComment: "stayed on",
		});

		const summary = await backfillHorseHistory("org-1", horse, provider as never);

		expect(summary).toEqual({ created: 0, skipped: 1, failed: 0 });
		expect(mockRaceEntryCreate).not.toHaveBeenCalled();
		expect(mockRaceEntryUpdate).not.toHaveBeenCalled();
	});

	it("leaves a still-DECLARED live entry completely untouched (check-results owns its result)", async () => {
		// Regression: filling finishingPosition here would hide the race from
		// check-results' `finishingPosition: null` pending query, so the member
		// would never get the result push or Circle RAN post.
		const provider = { getHorseHistory: vi.fn().mockResolvedValue([makeRun()]) };
		mockRaceEntryFindFirst.mockResolvedValue({
			id: "existing-entry",
			status: "DECLARED",
			finishingPosition: null,
			beatenLengths: null,
			ratingAchieved: null,
			timeformComment: null,
		});

		const summary = await backfillHorseHistory("org-1", horse, provider as never);

		expect(summary).toEqual({ created: 0, skipped: 1, failed: 0 });
		expect(mockRaceEntryCreate).not.toHaveBeenCalled();
		expect(mockRaceEntryUpdate).not.toHaveBeenCalled();
	});

	it("fills only currently-null result fields on an existing RAN entry", async () => {
		const provider = { getHorseHistory: vi.fn().mockResolvedValue([makeRun()]) };
		mockRaceEntryFindFirst.mockResolvedValue({
			id: "existing-entry",
			status: "RAN",
			finishingPosition: 2, // live value wins — must not be overwritten
			beatenLengths: null,
			ratingAchieved: null,
			timeformComment: null,
		});

		const summary = await backfillHorseHistory("org-1", horse, provider as never);

		expect(summary).toEqual({ created: 0, skipped: 1, failed: 0 });
		expect(mockRaceEntryCreate).not.toHaveBeenCalled();
		expect(mockRaceEntryUpdate).toHaveBeenCalledWith({
			where: { id: "existing-entry" },
			data: {
				beatenLengths: 0,
				ratingAchieved: 75,
				timeformComment: "stayed on",
			},
		});
		// status/notifiedStates/finishingPosition never in the update payload
		const data = mockRaceEntryUpdate.mock.calls[0][0].data;
		expect(data).not.toHaveProperty("status");
		expect(data).not.toHaveProperty("notifiedStates");
		expect(data).not.toHaveProperty("finishingPosition");
	});

	it("logs and continues when one run fails, still processing the rest", async () => {
		const runA = makeRun();
		const runB = makeRun({
			race: { ...makeRun().race, providerRaceId: "rac_10" },
			entry: { ...makeRun().entry, providerEntryId: "rac_10_hrs_45568460" },
		});
		const provider = {
			getHorseHistory: vi.fn().mockResolvedValue([runA, runB]),
		};
		mockRaceEntryFindFirst
			.mockRejectedValueOnce(new Error("db down"))
			.mockResolvedValueOnce(null);

		const summary = await backfillHorseHistory("org-1", horse, provider as never);

		expect(summary).toEqual({ created: 1, skipped: 0, failed: 1 });
	});
});
