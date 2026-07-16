/**
 * Results checker
 *
 * Finds races past their postTime where entries don't have results yet,
 * fetches results from the provider, and fires result pushes.
 *
 * @see Architecture/specs/S1-07-ingest-worker.md §8
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";

import type { RacingDataProvider } from "../provider/types";
import { handleStatusTransition } from "./transitions";

export async function checkForResults(
	organizationId: string,
	provider: RacingDataProvider,
): Promise<void> {
	const pendingRaces = await db.race.findMany({
		where: {
			organizationId,
			postTime: { lt: new Date() },
			entries: {
				some: {
					status: { in: ["DECLARED", "ENTERED"] },
					finishingPosition: null,
				},
			},
		},
		include: {
			entries: { include: { horse: true, jockey: true } },
			meeting: { include: { course: true } },
		},
	});

	for (const race of pendingRaces) {
		try {
			const result = await provider.getRaceResult(race.providerEntityId!);
			if (!result) continue;

			for (const entryResult of result.entries) {
				const raceEntry = race.entries.find(
					(e) => e.providerEntityId === entryResult.providerEntryId,
				);
				if (!raceEntry) continue;

				let horseSnapshot: {
					nextEntryId: string | null;
					latestEntryId: string | null;
				} | null = null;

				try {
					horseSnapshot = await db.horse.findUnique({
						where: { id: raceEntry.horse.id },
						select: { nextEntryId: true, latestEntryId: true },
					});

					const updated = await db.raceEntry.update({
						where: { id: raceEntry.id },
						data: {
							status: "RAN",
							finishingPosition: entryResult.finishingPosition ?? null,
							beatenLengths: entryResult.beatenLengths ?? null,
							ratingAchieved: entryResult.ratingAchieved ?? null,
							timeformComment: entryResult.timeformComment ?? null,
							performanceRating: entryResult.performanceRating ?? null,
							starRating: entryResult.starRating ?? null,
						},
					});

					await handleStatusTransition(
						organizationId,
						{ id: raceEntry.horse.id, name: raceEntry.horse.name },
						{
							id: race.id,
							name: race.name,
							postTime: race.postTime,
							courseName: race.meeting.course.name,
							distanceFurlongs: race.distanceFurlongs ?? null,
							goingDescription: race.goingDescription ?? null,
						},
						{
							...updated,
							finishingPosition: entryResult.finishingPosition ?? null,
							jockeyName: raceEntry.jockey?.name ?? null,
						},
						raceEntry.status,
						result.entries.length,
					);
				} catch (error) {
					try {
						// FABLE_AUDIT C5: the transition may have written a push marker
						// before a later step threw. Union pre-transition and current
						// markers instead of restoring the old value — re-firing a push
						// that already went out is worse than skipping the retry.
						const current = await db.raceEntry.findUnique({
							where: { id: raceEntry.id },
							select: { notifiedStates: true },
						});
						const preMarkers = (raceEntry.notifiedStates as string[] | null) ?? [];
						const currentMarkers = (current?.notifiedStates as string[] | null) ?? [];
						await db.raceEntry.update({
							where: { id: raceEntry.id },
							data: {
								status: raceEntry.status,
								finishingPosition: raceEntry.finishingPosition,
								beatenLengths: raceEntry.beatenLengths,
								ratingAchieved: raceEntry.ratingAchieved,
								timeformComment: raceEntry.timeformComment,
								performanceRating: raceEntry.performanceRating,
								starRating: raceEntry.starRating,
								notifiedStates: [...new Set([...preMarkers, ...currentMarkers])],
							},
						});

						if (horseSnapshot) {
							await db.horse.update({
								where: { id: raceEntry.horse.id },
								data: horseSnapshot,
							});
						}
					} catch (rollbackError) {
						logger.error(`Failed to roll back result transition for race ${race.id}`, {
							rollbackError,
						});
					}

					logger.error(
						`Result transition failed for horse ${raceEntry.horse.name} (${raceEntry.horse.id}) in race ${race.id}`,
						{ error },
					);
				}
			}
		} catch (error) {
			logger.error(`Result check failed for race ${race.id}`, { error });
		}
	}
}
