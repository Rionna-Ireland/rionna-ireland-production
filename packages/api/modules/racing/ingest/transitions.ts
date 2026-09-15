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

import { firstPhotoUrl } from "../../inbox/kinds";
import { recordInbox } from "../../inbox/record";
import { postRaceUpdateToCircle } from "./post-to-circle";
import { buildPushContent } from "./push-content";
import { sendPush } from "./send-push";

const PUSH_WORTHY_STATUSES: RaceEntryStatus[] = ["DECLARED", "NON_RUNNER", "RAN"];

const INBOX_KIND_BY_TRIGGER = {
	HORSE_DECLARED: "race_declared",
	HORSE_NON_RUNNER: "race_non_runner",
	RACE_RESULT: "race_result",
} as const;

interface TransitionHorse {
	id: string;
	name: string;
	/** S12-06a: only present when the caller already has the full Horse row. */
	photos?: unknown;
}

interface TransitionRace {
	id: string;
	name: string | null;
	postTime: Date;
	courseName: string;
	distanceFurlongs?: number | null;
	goingDescription?: string | null;
}

interface TransitionRaceEntry {
	id: string;
	status: RaceEntryStatus;
	notifiedStates: unknown;
	finishingPosition: number | null;
	jockeyName?: string | null;
}

export async function handleStatusTransition(
	organizationId: string,
	horse: TransitionHorse,
	race: TransitionRace,
	raceEntry: TransitionRaceEntry,
	previousStatus: RaceEntryStatus | null,
	fieldSize?: number,
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

	const inboxKind = INBOX_KIND_BY_TRIGGER[pushContent.triggerType];
	const badgeByUserId = await recordInbox({
		organizationId,
		audience: { kind: "horseFollowers", horseId: horse.id },
		item: {
			kind: inboxKind,
			groupKey: `${inboxKind}:${raceEntry.id}`,
			title: pushContent.title,
			body: pushContent.body,
			data: { screen: "horse", horseId: horse.id },
			refId: raceEntry.id,
			imageUrl: firstPhotoUrl(horse.photos),
		},
	});

	const delivery = await sendPush({
		organizationId,
		triggerType: pushContent.triggerType,
		triggerRefId: raceEntry.id,
		title: pushContent.title,
		body: pushContent.body,
		data: { screen: "horse", horseId: horse.id },
		followersOfHorseId: horse.id,
		badgeByUserId,
	});

	// FABLE_AUDIT C4: if delivery failed for the entire audience (e.g. Expo
	// outage), throwing here skips the notified marker and lets the caller's
	// rollback restore the previous status — the next ingest tick re-detects
	// the transition and retries (FAILED PushLog rows are re-claimable).
	// Partial delivery proceeds: re-pushing the successes would be worse.
	if (delivery.attempted > 0 && delivery.sent === 0) {
		throw new Error(
			`Push delivery failed for the whole audience (${delivery.failed} failures) — transition will retry`,
		);
	}

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
		race: {
			id: race.id,
			name: race.name,
			postTime: race.postTime,
			courseName: race.courseName,
			distanceFurlongs: race.distanceFurlongs ?? null,
			goingDescription: race.goingDescription ?? null,
		},
		raceEntry: {
			id: raceEntry.id,
			finishingPosition: raceEntry.finishingPosition,
			jockeyName: raceEntry.jockeyName ?? null,
			notifiedStates: [...notifiedStates, newStatus],
		},
		fieldSize,
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
