/**
 * Status transition handler
 *
 * Only DECLARED, NON_RUNNER, and RAN fire pushes.
 * notifiedStates prevents duplicate pushes on re-ingest.
 *
 * @see Architecture/specs/S1-07-ingest-worker.md §6
 */

import { db } from "@repo/database";
import type { RaceEntryStatus } from "@repo/database";
import { postRaceUpdateToCircle } from "./post-to-circle";
import { buildPushContent } from "./push-content";
import { sendPush } from "./send-push";

const PUSH_WORTHY_STATUSES: RaceEntryStatus[] = [
  "DECLARED",
  "NON_RUNNER",
  "RAN",
];

interface TransitionHorse {
  id: string;
  name: string;
}

interface TransitionRace {
  id: string;
  name: string | null;
  postTime: Date;
  courseName: string;
}

interface TransitionRaceEntry {
  id: string;
  status: RaceEntryStatus;
  notifiedStates: unknown;
  finishingPosition: number | null;
}

export async function handleStatusTransition(
  organizationId: string,
  horse: TransitionHorse,
  race: TransitionRace,
  raceEntry: TransitionRaceEntry,
  previousStatus: RaceEntryStatus | null,
): Promise<void> {
  const newStatus = raceEntry.status;

  if (!PUSH_WORTHY_STATUSES.includes(newStatus)) return;

  const notifiedStates = (raceEntry.notifiedStates as string[]) ?? [];
  if (notifiedStates.includes(newStatus)) return;

  const pushContent = buildPushContent(
    newStatus as "DECLARED" | "NON_RUNNER" | "RAN",
    horse,
    race,
    raceEntry,
  );

  await sendPush({
    organizationId,
    triggerType: pushContent.triggerType,
    triggerRefId: raceEntry.id,
    title: pushContent.title,
    body: pushContent.body,
    data: { screen: "horse", horseId: horse.id },
  });

  // Mark as notified (idempotency)
  await db.raceEntry.update({
    where: { id: raceEntry.id },
    data: {
      notifiedStates: [...notifiedStates, newStatus],
    },
  });

  await postRaceUpdateToCircle({
    organizationId,
    status: newStatus,
    horse: { id: horse.id, name: horse.name },
    race: { id: race.id, name: race.name, postTime: race.postTime, courseName: race.courseName },
    raceEntry: {
      id: raceEntry.id,
      finishingPosition: raceEntry.finishingPosition,
      notifiedStates: [...notifiedStates, newStatus],
    },
    // fieldSize not available on TransitionRace — omit; copy drops the "of N" clause.
  });

  // Update denormalized fields on Horse
  if (newStatus === "DECLARED") {
    await db.horse.update({
      where: { id: horse.id },
      data: { nextEntryId: raceEntry.id },
    });
  }
  if (newStatus === "RAN") {
    await db.horse.update({
      where: { id: horse.id },
      data: {
        latestEntryId: raceEntry.id,
        nextEntryId: null,
      },
    });
  }
}
