/**
 * Horse race history backfill
 *
 * Runs once per sync (link or re-sync) to populate a horse's full career
 * as RAN entries, using the same Course/Meeting/Race upsert chain as the
 * forward-ingest path. Deliberately does NOT call handleStatusTransition —
 * backfilled runs are history, not events, and must never push or Circle-post.
 *
 * @see Architecture/specs/S8-02-horse-race-history-backfill.md
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";
import type { RacingDataProvider } from "../provider/types";
import { upsertCourse, upsertMeeting, upsertRace, upsertJockey } from "./upserts";

// Seeded on every backfilled entry so no future code path (push or Circle
// post) treats a historical run as a fresh transition to notify on.
const BACKFILL_NOTIFIED_STATES = [
  "DECLARED",
  "RAN",
  "NON_RUNNER",
  "circle:DECLARED",
  "circle:RAN",
];

interface BackfillHorse {
  id: string;
  name: string;
  providerEntityId: string | null;
  trainerId: string | null;
}

export interface BackfillSummary {
  created: number;
  skipped: number;
  failed: number;
}

export async function backfillHorseHistory(
  organizationId: string,
  horse: BackfillHorse,
  provider: RacingDataProvider,
): Promise<BackfillSummary> {
  const summary: BackfillSummary = { created: 0, skipped: 0, failed: 0 };

  if (!horse.providerEntityId) return summary;

  const runs = await provider.getHorseHistory(horse.providerEntityId);

  for (const run of runs) {
    try {
      const course = await upsertCourse(organizationId, run.meeting);
      const meeting = await upsertMeeting(
        organizationId,
        course.id,
        run.meeting,
      );
      const race = await upsertRace(organizationId, meeting.id, run.race);

      let jockeyId: string | undefined;
      if (run.entry.providerJockeyId) {
        const jockey = await upsertJockey(organizationId, run.entry);
        jockeyId = jockey.id;
      }

      const existing = await db.raceEntry.findFirst({
        where: {
          organizationId,
          providerEntityId: run.entry.providerEntryId,
        },
      });

      if (existing) {
        // Idempotent and non-destructive: a live-ingested entry always wins.
        // Only fill result fields on entries already RAN — filling
        // finishingPosition on a still-DECLARED entry would hide the race
        // from check-results' `finishingPosition: null` pending query, so
        // the member would never get the result push or Circle post.
        if (existing.status !== "RAN") {
          summary.skipped += 1;
          continue;
        }

        // At most fill in result fields the live path hasn't populated yet —
        // never touch status or notifiedStates.
        const fill: Record<string, unknown> = {};
        if (existing.finishingPosition == null && run.result.finishingPosition != null) {
          fill.finishingPosition = run.result.finishingPosition;
        }
        if (existing.beatenLengths == null && run.result.beatenLengths != null) {
          fill.beatenLengths = run.result.beatenLengths;
        }
        if (existing.ratingAchieved == null && run.result.ratingAchieved != null) {
          fill.ratingAchieved = run.result.ratingAchieved;
        }
        if (existing.timeformComment == null && run.result.timeformComment != null) {
          fill.timeformComment = run.result.timeformComment;
        }

        if (Object.keys(fill).length > 0) {
          await db.raceEntry.update({ where: { id: existing.id }, data: fill });
        }

        summary.skipped += 1;
        continue;
      }

      await db.raceEntry.create({
        data: {
          organizationId,
          providerEntityId: run.entry.providerEntryId,
          horseId: horse.id,
          raceId: race.id,
          status: "RAN",
          weightLbs: run.entry.weightLbs ?? null,
          jockeyId: jockeyId ?? null,
          trainerId: horse.trainerId,
          finishingPosition: run.result.finishingPosition ?? null,
          beatenLengths: run.result.beatenLengths ?? null,
          ratingAchieved: run.result.ratingAchieved ?? null,
          timeformComment: run.result.timeformComment ?? null,
          notifiedStates: BACKFILL_NOTIFIED_STATES,
        },
      });

      summary.created += 1;
    } catch (error) {
      logger.warn(
        `Backfill failed for horse ${horse.name} (${horse.id}) race ${run.race.providerRaceId}`,
        { error },
      );
      summary.failed += 1;
    }
  }

  return summary;
}
