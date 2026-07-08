/**
 * postRaceUpdateToCircle (S6-08)
 *
 * Fail-safe helper: posts a one-line race update into a horse's Circle
 * space on DECLARED/RAN transitions. Deliberately never throws — a Circle
 * outage must never break race ingest. The `notifiedStates` marker
 * (`circle:<STATUS>`) is only written once the post actually succeeds, so
 * a transient failure — or a horse whose Circle space isn't active yet —
 * retries automatically on the next ingest tick instead of being silently
 * dropped forever.
 *
 * @see Architecture/specs/S6-08-circle-race-updates.md
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import type { CircleTiptapBody } from "@repo/payments/lib/circle";

import {
	buildCirclePostContent,
	type CirclePostContentEntry,
	type CirclePostContentHorse,
	type CirclePostContentRace,
} from "./circle-post-content";

export interface PostRaceUpdateToCircleInput {
	organizationId: string;
	status: string;
	horse: CirclePostContentHorse;
	race: CirclePostContentRace;
	raceEntry: {
		id: string;
		finishingPosition: number | null;
		jockeyName?: string | null;
		notifiedStates: string[];
	};
	fieldSize?: number;
}

function buildTiptapBody(text: string): CircleTiptapBody {
	return {
		body: {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text }],
				},
			],
		},
	};
}

/**
 * Post a race update to a horse's Circle space. Never throws — every
 * failure path (missing space, inactive space, missing org slug, a Circle
 * API failure, or an unexpected error) logs and returns without writing
 * the `notifiedStates` marker, so the next ingest tick retries.
 */
export async function postRaceUpdateToCircle(input: PostRaceUpdateToCircleInput): Promise<void> {
	try {
		const { organizationId, status, horse, race, raceEntry, fieldSize } = input;

		const content = buildCirclePostContent(
			status,
			horse,
			race,
			{
				finishingPosition: raceEntry.finishingPosition,
				jockeyName: raceEntry.jockeyName ?? null,
			} satisfies CirclePostContentEntry,
			fieldSize,
		);
		if (!content) return;

		const marker = `circle:${status}`;
		if (raceEntry.notifiedStates.includes(marker)) return;

		const horseRow = await db.horse.findFirst({
			where: { id: horse.id, organizationId },
			select: { circleSpaceId: true, circleSpaceStatus: true },
		});
		if (!horseRow?.circleSpaceId || horseRow.circleSpaceStatus !== "active") {
			logger.info("[postRaceUpdateToCircle] Horse Circle space not ready — skipping", {
				horseId: horse.id,
				raceEntryId: raceEntry.id,
				circleSpaceId: horseRow?.circleSpaceId ?? null,
				circleSpaceStatus: horseRow?.circleSpaceStatus ?? null,
			});
			return;
		}

		const org = await db.organization.findUnique({
			where: { id: organizationId },
			select: { slug: true },
		});
		if (!org?.slug) {
			logger.warn("[postRaceUpdateToCircle] No org slug — skipping", {
				organizationId,
				raceEntryId: raceEntry.id,
			});
			return;
		}

		const circle = createCircleService(org.slug);
		const outcome = await circle.createPost({
			spaceId: horseRow.circleSpaceId,
			name: content.title,
			tiptapBody: buildTiptapBody(content.body),
			idempotencyKey: `${raceEntry.id}:${marker}`,
		});

		if (!outcome.ok) {
			logger.warn("[postRaceUpdateToCircle] Circle rejected the post — will retry next tick", {
				raceEntryId: raceEntry.id,
				reason: outcome.reason,
			});
			return;
		}

		await db.raceEntry.update({
			where: { id: raceEntry.id },
			data: { notifiedStates: [...raceEntry.notifiedStates, marker] },
		});
	} catch (error) {
		logger.warn("[postRaceUpdateToCircle] Unexpected error — swallowing", {
			raceEntryId: input.raceEntry.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
