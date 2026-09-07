import { db } from "@repo/database";

/**
 * Circle space ids that back a `Horse` row for this org (S12-02b).
 *
 * QA finding: the admin-listed horse space-group id can drift from
 * `metadata.circle.spaceGroupId`, so horse detection can't rely solely on
 * `isHorseSpace` (space-group comparison) — a space is also a horse space
 * when it's the `circleSpaceId` of an actual `Horse` row. See `buildFeedChips`.
 */
export async function getHorseSpaceIds(organizationId: string): Promise<Set<string>> {
	const horses = await db.horse.findMany({
		where: { organizationId, circleSpaceId: { not: null } },
		select: { circleSpaceId: true },
	});
	return new Set(
		horses
			.map((h: { circleSpaceId: string | null }) => h.circleSpaceId)
			.filter((id): id is string => id !== null),
	);
}
