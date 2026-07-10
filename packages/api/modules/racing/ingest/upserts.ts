/**
 * Upsert helpers for the ingest worker.
 *
 * Each upsert uses providerEntityId as the match key. Course identity is
 * derived from provider meeting identity instead of the human-readable name,
 * so a rename does not merge distinct rows.
 *
 * @see Architecture/specs/S1-07-ingest-worker.md §5
 */

import { db } from "@repo/database";
import type { RaceEntryStatus } from "@repo/database";
import type { ProviderEntry } from "../provider/types";

function courseProviderEntityId(meeting: ProviderEntry["meeting"]): string {
  return meeting.providerCourseId;
}

/**
 * Statuses that must never be overwritten by a stale/earlier-stage status
 * from a later ingest tick (e.g. a same-day racecard fetch still reporting
 * DECLARED for a race that has already run).
 *
 * @see Architecture/specs/S5-09-fable-audit-hardening.md Task 1.1
 */
const TERMINAL_STATUSES: RaceEntryStatus[] = ["RAN", "NON_RUNNER"];

export async function upsertCourse(
  organizationId: string,
  meeting: ProviderEntry["meeting"],
) {
  const providerEntityId = courseProviderEntityId(meeting);
  return db.course.upsert({
    where: {
      organizationId_providerEntityId: {
        organizationId,
        providerEntityId,
      },
    },
    create: {
      organizationId,
      providerEntityId,
      name: meeting.courseName,
      country: meeting.courseCountry ?? null,
    },
    update: {
      name: meeting.courseName,
    },
  });
}

export async function upsertMeeting(
  organizationId: string,
  courseId: string,
  meeting: ProviderEntry["meeting"],
) {
  return db.meeting.upsert({
    where: {
      organizationId_providerEntityId: {
        organizationId,
        providerEntityId: meeting.providerMeetingId,
      },
    },
    create: {
      organizationId,
      providerEntityId: meeting.providerMeetingId,
      courseId,
      date: meeting.date,
    },
    update: {
      date: meeting.date,
    },
  });
}

export async function upsertRace(
  organizationId: string,
  meetingId: string,
  race: ProviderEntry["race"],
) {
  return db.race.upsert({
    where: {
      organizationId_providerEntityId: {
        organizationId,
        providerEntityId: race.providerRaceId,
      },
    },
    create: {
      organizationId,
      providerEntityId: race.providerRaceId,
      meetingId,
      postTime: race.postTime,
      name: race.name ?? null,
      raceType: race.raceType ?? null,
      distanceFurlongs: race.distanceFurlongs ?? null,
      className: race.className ?? null,
      prizeMoney: race.prizeMoney ?? null,
      goingDescription: race.goingDescription ?? null,
    },
    update: {
      postTime: race.postTime,
      name: race.name ?? null,
      raceType: race.raceType ?? null,
      distanceFurlongs: race.distanceFurlongs ?? null,
      className: race.className ?? null,
      prizeMoney: race.prizeMoney ?? null,
      goingDescription: race.goingDescription ?? null,
    },
  });
}

export async function upsertJockey(
  organizationId: string,
  entry: ProviderEntry["entry"],
) {
  return db.jockey.upsert({
    where: {
      organizationId_providerEntityId: {
        organizationId,
        providerEntityId: entry.providerJockeyId!,
      },
    },
    create: {
      organizationId,
      providerEntityId: entry.providerJockeyId!,
      name: entry.jockeyName ?? "Unknown",
    },
    update: {
      name: entry.jockeyName ?? "Unknown",
    },
  });
}

export async function upsertRaceEntry(
  organizationId: string,
  horseId: string,
  raceId: string,
  jockeyId: string | undefined,
  trainerId: string | null,
  entry: ProviderEntry["entry"],
) {
  const existing = await db.raceEntry.findFirst({
    where: {
      organizationId,
      providerEntityId: entry.providerEntryId,
    },
  });

  const previousStatus = existing?.status ?? null;

  // Guard against a provider re-emitting a stale (earlier-stage) status for
  // a race entry that has already reached a terminal status. Without this,
  // a same-day racecard fetch that still lists a finished race as DECLARED
  // would flip a RAN/NON_RUNNER entry back on the next ingest tick.
  const keepExistingStatus =
    existing != null &&
    TERMINAL_STATUSES.includes(existing.status) &&
    !TERMINAL_STATUSES.includes(entry.status);

  const raceEntry = await db.raceEntry.upsert({
    where: {
      organizationId_providerEntityId: {
        organizationId,
        providerEntityId: entry.providerEntryId,
      },
    },
    create: {
      organizationId,
      providerEntityId: entry.providerEntryId,
      horseId,
      raceId,
      status: entry.status,
      draw: entry.draw ?? null,
      weightLbs: entry.weightLbs ?? null,
      jockeyId: jockeyId ?? null,
      trainerId: trainerId ?? null,
      notifiedStates: [],
    },
    update: {
      ...(keepExistingStatus ? {} : { status: entry.status }),
      draw: entry.draw ?? null,
      weightLbs: entry.weightLbs ?? null,
      jockeyId: jockeyId ?? null,
      trainerId: trainerId ?? null,
    },
  });

  return { raceEntry, previousStatus, existing };
}
