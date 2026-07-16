/**
 * S1-07: Result checker per-entry isolation tests
 *
 * Verifies that one failed result transition does not prevent the rest of the
 * race entries from being processed, and that the failed update is restored so
 * the next sweep can retry it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRaceFindMany = vi.fn();
const mockRaceEntryUpdate = vi.fn();
const mockRaceEntryFindUnique = vi.fn().mockResolvedValue(null);
const mockHorseFindUnique = vi.fn();
const mockHorseUpdate = vi.fn().mockResolvedValue({});

vi.mock("@repo/database", () => ({
	db: {
		race: {
			findMany: (...args: unknown[]) => mockRaceFindMany(...args),
		},
		raceEntry: {
			update: (...args: unknown[]) => mockRaceEntryUpdate(...args),
			findUnique: (...args: unknown[]) => mockRaceEntryFindUnique(...args),
		},
		horse: {
			findUnique: (...args: unknown[]) => mockHorseFindUnique(...args),
			update: (...args: unknown[]) => mockHorseUpdate(...args),
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

const mockHandleStatusTransition = vi.fn();
vi.mock("../transitions", () => ({
	handleStatusTransition: (...args: unknown[]) => mockHandleStatusTransition(...args),
}));

import { checkForResults } from "../check-results";

describe("checkForResults", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("continues after a failed entry and restores the original row state", async () => {
		mockRaceFindMany.mockResolvedValue([
			{
				id: "race-1",
				providerEntityId: "provider-race-1",
				name: "Race 1",
				postTime: new Date("2026-04-13T10:00:00Z"),
				meeting: { course: { name: "Leopardstown" } },
				entries: [
					{
						id: "entry-1",
						providerEntityId: "provider-entry-1",
						status: "DECLARED",
						finishingPosition: null,
						beatenLengths: null,
						ratingAchieved: null,
						timeformComment: null,
						performanceRating: null,
						starRating: null,
						notifiedStates: [],
						horse: { id: "horse-1", name: "Pink Jasmine" },
					},
					{
						id: "entry-2",
						providerEntityId: "provider-entry-2",
						status: "DECLARED",
						finishingPosition: null,
						beatenLengths: null,
						ratingAchieved: null,
						timeformComment: null,
						performanceRating: null,
						starRating: null,
						notifiedStates: [],
						horse: { id: "horse-2", name: "Crimson Tide" },
					},
				],
			},
		]);

		mockRaceEntryUpdate
			.mockResolvedValueOnce({
				id: "entry-1",
				status: "RAN",
				finishingPosition: 1,
				notifiedStates: [],
			})
			.mockResolvedValueOnce({
				id: "entry-1",
				status: "DECLARED",
				finishingPosition: null,
				notifiedStates: [],
			})
			.mockResolvedValueOnce({
				id: "entry-2",
				status: "RAN",
				finishingPosition: 2,
				notifiedStates: [],
			});

		mockHorseFindUnique.mockResolvedValue({
			nextEntryId: "horse-next",
			latestEntryId: null,
		});

		mockHandleStatusTransition
			.mockRejectedValueOnce(new Error("push failed"))
			.mockResolvedValueOnce(undefined);

		const provider = {
			getRaceResult: vi.fn().mockResolvedValue({
				providerRaceId: "provider-race-1",
				entries: [
					{
						providerEntryId: "provider-entry-1",
						finishingPosition: 1,
					},
					{
						providerEntryId: "provider-entry-2",
						finishingPosition: 2,
					},
				],
			}),
		};

		await checkForResults("org-1", provider as never);

		expect(mockHandleStatusTransition).toHaveBeenCalledTimes(2);
		expect(mockRaceEntryUpdate).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				where: { id: "entry-1" },
				data: expect.objectContaining({ status: "RAN" }),
			}),
		);
		expect(mockRaceEntryUpdate).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				where: { id: "entry-1" },
				data: expect.objectContaining({ status: "DECLARED" }),
			}),
		);
		expect(mockRaceEntryUpdate).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({
				where: { id: "entry-2" },
				data: expect.objectContaining({ status: "RAN" }),
			}),
		);
		expect(mockHorseUpdate).toHaveBeenCalledWith({
			where: { id: "horse-1" },
			data: {
				nextEntryId: "horse-next",
				latestEntryId: null,
			},
		});
	});

	// ── FABLE_AUDIT C5: rollback must not erase a just-written push marker ──

	it("unions pre-transition and current notified markers on rollback", async () => {
		mockRaceFindMany.mockResolvedValue([
			{
				id: "race-1",
				providerEntityId: "provider-race-1",
				name: "Race 1",
				postTime: new Date("2026-04-13T10:00:00Z"),
				meeting: { course: { name: "Leopardstown" } },
				entries: [
					{
						id: "entry-1",
						providerEntityId: "provider-entry-1",
						status: "DECLARED",
						finishingPosition: null,
						beatenLengths: null,
						ratingAchieved: null,
						timeformComment: null,
						performanceRating: null,
						starRating: null,
						notifiedStates: ["DECLARED"],
						horse: { id: "horse-1", name: "Pink Jasmine" },
					},
				],
			},
		]);

		mockRaceEntryUpdate.mockResolvedValue({
			id: "entry-1",
			status: "RAN",
			finishingPosition: 1,
			notifiedStates: ["DECLARED"],
		});
		mockHorseFindUnique.mockResolvedValue({ nextEntryId: null, latestEntryId: null });
		// The transition wrote the RAN marker (push went out), then a later step threw.
		mockRaceEntryFindUnique.mockResolvedValueOnce({
			notifiedStates: ["DECLARED", "RAN"],
		});
		mockHandleStatusTransition.mockRejectedValueOnce(new Error("circle post failed"));

		const provider = {
			getRaceResult: vi.fn().mockResolvedValue({
				providerRaceId: "provider-race-1",
				entries: [{ providerEntryId: "provider-entry-1", finishingPosition: 1 }],
			}),
		};

		await checkForResults("org-1", provider as never);

		const calls = mockRaceEntryUpdate.mock.calls;
		const rollbackCall = calls[calls.length - 1]?.[0];
		expect(rollbackCall).toMatchObject({
			where: { id: "entry-1" },
			data: expect.objectContaining({
				status: "DECLARED",
				notifiedStates: ["DECLARED", "RAN"], // union — the sent push stays marked
			}),
		});
	});

	it("passes fieldSize (provider runner count), distance/going and jockey name to handleStatusTransition", async () => {
		mockRaceFindMany.mockResolvedValue([
			{
				id: "race-1",
				providerEntityId: "provider-race-1",
				name: "Race 1",
				postTime: new Date("2026-04-13T10:00:00Z"),
				distanceFurlongs: 22,
				goingDescription: "Soft",
				meeting: { course: { name: "Leopardstown" } },
				entries: [
					{
						id: "entry-1",
						providerEntityId: "provider-entry-1",
						status: "DECLARED",
						finishingPosition: null,
						beatenLengths: null,
						ratingAchieved: null,
						timeformComment: null,
						performanceRating: null,
						starRating: null,
						notifiedStates: [],
						horse: { id: "horse-1", name: "Pink Jasmine" },
						jockey: { name: "Eoghan Finegan" },
					},
				],
			},
		]);

		mockRaceEntryUpdate.mockResolvedValueOnce({
			id: "entry-1",
			status: "RAN",
			finishingPosition: 6,
			notifiedStates: [],
		});

		mockHorseFindUnique.mockResolvedValue({
			nextEntryId: null,
			latestEntryId: null,
		});

		mockHandleStatusTransition.mockResolvedValueOnce(undefined);

		const provider = {
			getRaceResult: vi.fn().mockResolvedValue({
				providerRaceId: "provider-race-1",
				entries: [
					{ providerEntryId: "provider-entry-1", finishingPosition: 6 },
					{ providerEntryId: "provider-entry-other-1" },
					{ providerEntryId: "provider-entry-other-2" },
					{ providerEntryId: "provider-entry-other-3" },
					{ providerEntryId: "provider-entry-other-4" },
					{ providerEntryId: "provider-entry-other-5" },
					{ providerEntryId: "provider-entry-other-6" },
					{ providerEntryId: "provider-entry-other-7" },
				],
			}),
		};

		await checkForResults("org-1", provider as never);

		expect(mockHandleStatusTransition).toHaveBeenCalledOnce();
		const [, , racePassed, raceEntryPassed, , fieldSizePassed] =
			mockHandleStatusTransition.mock.calls[0];
		expect(fieldSizePassed).toBe(8);
		expect(racePassed).toMatchObject({
			distanceFurlongs: 22,
			goingDescription: "Soft",
		});
		expect(raceEntryPassed).toMatchObject({
			jockeyName: "Eoghan Finegan",
		});
	});
});
