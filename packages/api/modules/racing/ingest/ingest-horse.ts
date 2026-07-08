/**
 * Per-horse ingest
 *
 * Fetches entries from the provider and upserts the
 * Course → Meeting → Race → RaceEntry chain, detecting
 * status transitions along the way.
 *
 * @see Architecture/specs/S1-07-ingest-worker.md §4
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";
import type { RacingDataProvider } from "../provider/types";
import {
  upsertCourse,
  upsertMeeting,
  upsertRace,
  upsertJockey,
  upsertRaceEntry,
} from "./upserts";
import { handleStatusTransition } from "./transitions";

interface IngestHorse {
  id: string;
  name: string;
  providerEntityId: string | null;
  trainerId: string | null;
}

export async function ingestHorse(
  organizationId: string,
  horse: IngestHorse,
  provider: RacingDataProvider,
): Promise<void> {
  const entries = await provider.getEntriesForHorse(horse.providerEntityId!, {
    lookAheadDays: 7,
  });

  for (const entry of entries) {
    try {
      const course = await upsertCourse(organizationId, entry.meeting);
      const meeting = await upsertMeeting(
        organizationId,
        course.id,
        entry.meeting,
      );
      const race = await upsertRace(organizationId, meeting.id, entry.race);

      let jockeyId: string | undefined;
      if (entry.entry.providerJockeyId) {
        const jockey = await upsertJockey(organizationId, entry.entry);
        jockeyId = jockey.id;
      }

      const { raceEntry, previousStatus, existing } = await upsertRaceEntry(
        organizationId,
        horse.id,
        race.id,
        jockeyId,
        horse.trainerId,
        entry.entry,
      );

      if (
        raceEntry.status === "DECLARED" ||
        raceEntry.status === "NON_RUNNER" ||
        raceEntry.status === "RAN"
      ) {
        const horseSnapshot = await db.horse.findUnique({
          where: { id: horse.id },
          select: { nextEntryId: true, latestEntryId: true },
        });

        try {
          await handleStatusTransition(
            organizationId,
            { id: horse.id, name: horse.name },
            {
              id: race.id,
              name: race.name,
              postTime: race.postTime,
              courseName: course.name,
              distanceFurlongs: race.distanceFurlongs,
              goingDescription: race.goingDescription,
            },
            { ...raceEntry, jockeyName: entry.entry.jockeyName ?? null },
            previousStatus,
          );
        } catch (error) {
          try {
            if (existing) {
              await db.raceEntry.update({
                where: { id: raceEntry.id },
                data: {
                  status: previousStatus ?? existing.status,
                  notifiedStates:
                    (existing.notifiedStates as string[] | null) ?? [],
                },
              });
            } else {
              await db.raceEntry.delete({ where: { id: raceEntry.id } });
            }

            if (horseSnapshot) {
              await db.horse.update({
                where: { id: horse.id },
                data: horseSnapshot,
              });
            }
          } catch (rollbackError) {
            logger.error(
              `Failed to roll back racing transition for horse ${horse.name} (${horse.id})`,
              { rollbackError },
            );
          }

          throw error;
        }
      }
    } catch (error) {
      logger.error(
        `Ingest failed for horse ${horse.name} (${horse.id}) entry ${entry.entry.providerEntryId}`,
        { error },
      );
    }
  }

  // Update horse sync timestamp
  await db.horse.update({
    where: { id: horse.id },
    data: { providerLastSync: new Date() },
  });
}
