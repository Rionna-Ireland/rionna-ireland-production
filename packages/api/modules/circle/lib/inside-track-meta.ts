import { db } from "@repo/database";
import { logger } from "@repo/logs";

import type { MemberFeedItem } from "./parse-post";

/**
 * S13-13: batched `InsideTrackMeta` lookup — admin-entered video lengths keyed
 * by Circle post id. One query for the whole response (no N+1). Fails open to
 * "no overrides": a meta outage must never break Inside Track.
 */
export async function loadInsideTrackDurations(
	organizationId: string,
	circlePostIds: string[],
): Promise<Map<string, number>> {
	const out = new Map<string, number>();
	const ids = [...new Set(circlePostIds.filter(Boolean))];
	if (ids.length === 0) return out;
	try {
		const rows = await db.insideTrackMeta.findMany({
			where: { organizationId, circlePostId: { in: ids } },
			select: { circlePostId: true, videoDurationSeconds: true },
		});
		for (const row of rows) {
			if (row.videoDurationSeconds !== null && row.videoDurationSeconds > 0) {
				out.set(row.circlePostId, row.videoDurationSeconds);
			}
		}
	} catch (error) {
		logger.warn("[Circle] Inside Track: meta lookup failed; using parsed durations", {
			organizationId,
			error: String(error),
		});
	}
	return out;
}

/** Admin value wins over the parsed one; with neither, the field is omitted. */
export function applyVideoDurations(
	items: MemberFeedItem[],
	overrides: Map<string, number>,
): MemberFeedItem[] {
	return items.map((item) => {
		const seconds = overrides.get(item.id) ?? item.videoDurationSeconds;
		const { videoDurationSeconds: _parsed, ...rest } = item;
		return seconds === undefined ? rest : { ...rest, videoDurationSeconds: seconds };
	});
}
