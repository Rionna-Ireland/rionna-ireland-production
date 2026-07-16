/**
 * S1-07: Ingest horse per-entry isolation tests
 *
 * Verifies that a failing transition for one provider entry does not abort
 * later entries for the same horse, and that the failed transition is rolled
 * back so it can be retried on the next ingest run.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockHorseFindUnique = vi.fn();
const mockHorseUpdate = vi.fn().mockResolvedValue({});
const mockRaceEntryDelete = vi.fn().mockResolvedValue({});
const mockRaceEntryUpdate = vi.fn().mockResolvedValue({});
const mockRaceEntryFindUnique = vi.fn().mockResolvedValue(null);

vi.mock("@repo/database", () => ({
	db: {
		horse: {
			findUnique: (...args: unknown[]) => mockHorseFindUnique(...args),
			update: (...args: unknown[]) => mockHorseUpdate(...args),
		},
		raceEntry: {
			delete: (...args: unknown[]) => mockRaceEntryDelete(...args),
			update: (...args: unknown[]) => mockRaceEntryUpdate(...args),
			findUnique: (...args: unknown[]) => mockRaceEntryFindUnique(...args),
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

const mockUpsertCourse = vi.fn().mockResolvedValue({ id: "course-1", name: "Course" });
const mockUpsertMeeting = vi.fn().mockResolvedValue({ id: "meeting-1" });
const mockUpsertRace = vi.fn().mockResolvedValue({
	id: "race-1",
	name: "Race",
	postTime: new Date("2026-04-13T12:00:00Z"),
});
const mockUpsertJockey = vi.fn().mockResolvedValue({ id: "jockey-1" });
const mockUpsertRaceEntry = vi.fn();

vi.mock("../upserts", () => ({
	upsertCourse: (...args: unknown[]) => mockUpsertCourse(...args),
	upsertMeeting: (...args: unknown[]) => mockUpsertMeeting(...args),
	upsertRace: (...args: unknown[]) => mockUpsertRace(...args),
	upsertJockey: (...args: unknown[]) => mockUpsertJockey(...args),
	upsertRaceEntry: (...args: unknown[]) => mockUpsertRaceEntry(...args),
}));

const mockHandleStatusTransition = vi.fn();
vi.mock("../transitions", () => ({
	handleStatusTransition: (...args: unknown[]) => mockHandleStatusTransition(...args),
}));

import { ingestHorse } from "../ingest-horse";

describe("ingestHorse", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("continues after a failed entry and rolls back the failed transition", async () => {
		const provider = {
			getEntriesForHorse: vi.fn().mockResolvedValue([
				{
					providerHorseId: "horse-1",
					meeting: {
						providerMeetingId: "meeting-a",
						providerCourseId: "course-a",
						courseName: "Leopardstown",
						courseCountry: "IE",
						date: new Date("2026-04-13T09:00:00Z"),
					},
					race: {
						providerRaceId: "race-a",
						postTime: new Date("2026-04-13T10:00:00Z"),
						name: "Race A",
					},
					entry: {
						providerEntryId: "entry-a",
						status: "DECLARED",
					},
				},
				{
					providerHorseId: "horse-1",
					meeting: {
						providerMeetingId: "meeting-b",
						providerCourseId: "course-b",
						courseName: "Curragh",
						courseCountry: "IE",
						date: new Date("2026-04-13T09:00:00Z"),
					},
					race: {
						providerRaceId: "race-b",
						postTime: new Date("2026-04-13T11:00:00Z"),
						name: "Race B",
					},
					entry: {
						providerEntryId: "entry-b",
						status: "DECLARED",
					},
				},
			]),
		};

		mockHorseFindUnique.mockResolvedValue({
			nextEntryId: "horse-next",
			latestEntryId: "horse-latest",
		});

		mockUpsertRaceEntry
			.mockResolvedValueOnce({
				raceEntry: {
					id: "race-entry-a",
					status: "DECLARED",
					notifiedStates: [],
				},
				previousStatus: "ENTERED",
				existing: null,
			})
			.mockResolvedValueOnce({
				raceEntry: {
					id: "race-entry-b",
					status: "DECLARED",
					notifiedStates: [],
				},
				previousStatus: "ENTERED",
				existing: null,
			});

		mockHandleStatusTransition
			.mockRejectedValueOnce(new Error("push failed"))
			.mockResolvedValueOnce(undefined);

		await ingestHorse(
			"org-1",
			{
				id: "horse-1",
				name: "Pink Jasmine",
				providerEntityId: "provider-horse-1",
				trainerId: null,
			},
			provider as never,
		);

		expect(mockHandleStatusTransition).toHaveBeenCalledTimes(2);
		expect(mockRaceEntryDelete).toHaveBeenCalledWith({
			where: { id: "race-entry-a" },
		});
		expect(mockHorseUpdate).toHaveBeenCalledWith({
			where: { id: "horse-1" },
			data: {
				nextEntryId: "horse-next",
				latestEntryId: "horse-latest",
			},
		});
		expect(mockUpsertCourse).toHaveBeenCalledTimes(2);
		expect(provider.getEntriesForHorse).toHaveBeenCalledOnce();
		expect(mockHorseUpdate).toHaveBeenCalledWith({
			where: { id: "horse-1" },
			data: expect.objectContaining({ providerLastSync: expect.any(Date) }),
		});
	});

	// ── FABLE_AUDIT C5: rollback must not erase a just-written push marker ──

	it("unions pre-transition and current notified markers on rollback", async () => {
		const provider = {
			getEntriesForHorse: vi.fn().mockResolvedValue([
				{
					providerHorseId: "horse-1",
					meeting: {
						providerMeetingId: "meeting-a",
						providerCourseId: "course-a",
						courseName: "Leopardstown",
						courseCountry: "IE",
						date: new Date("2026-04-13T09:00:00Z"),
					},
					race: {
						providerRaceId: "race-a",
						postTime: new Date("2026-04-13T10:00:00Z"),
						name: "Race A",
					},
					entry: {
						providerEntryId: "entry-a",
						status: "DECLARED",
					},
				},
			]),
		};

		mockHorseFindUnique.mockResolvedValue({ nextEntryId: null, latestEntryId: null });
		mockUpsertRaceEntry.mockResolvedValueOnce({
			raceEntry: { id: "race-entry-a", status: "DECLARED", notifiedStates: [] },
			previousStatus: "ENTERED",
			existing: { status: "ENTERED", notifiedStates: [] },
		});
		// The transition wrote the DECLARED marker (push went out), then a later
		// step (e.g. the Circle post) threw.
		mockRaceEntryFindUnique.mockResolvedValueOnce({ notifiedStates: ["DECLARED"] });
		mockHandleStatusTransition.mockRejectedValueOnce(new Error("circle post failed"));

		await ingestHorse(
			"org-1",
			{ id: "horse-1", name: "Pink Jasmine", providerEntityId: "p1", trainerId: null },
			provider as never,
		);

		expect(mockRaceEntryUpdate).toHaveBeenCalledWith({
			where: { id: "race-entry-a" },
			data: {
				status: "ENTERED",
				notifiedStates: ["DECLARED"], // union — the sent push must stay marked
			},
		});
	});
});
