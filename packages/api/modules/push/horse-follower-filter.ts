import { db, parseOrgMetadata } from "@repo/database";

/**
 * Who counts as "followers of this horse" for notifications. Shared by push
 * targeting and the S12-06 inbox so the two can never disagree.
 *
 * Returns `null` when no filter applies (everyone in the org), otherwise the
 * follower user ids.
 *
 * S8-04 §5: when the org's follow layer is disabled, fall back to all
 * members rather than filtering by (unmaintained) follow rows.
 * S9-05: invite-only horses are always filtered, regardless of the
 * kill-switch. A horse row that can't be found is treated as invite-only —
 * never widen the audience on absent data.
 */
export async function resolveHorseFollowerUserIds(
	organizationId: string,
	horseId: string,
): Promise<Set<string> | null> {
	const [org, horse] = await Promise.all([
		db.organization.findUnique({ where: { id: organizationId }, select: { metadata: true } }),
		db.horse.findUnique({ where: { id: horseId }, select: { inviteOnly: true } }),
	]);
	const horseFollowsEnabled = parseOrgMetadata(org?.metadata ?? null).features?.horseFollows !== false;
	const mustFilter = horse?.inviteOnly !== false || horseFollowsEnabled;
	if (!mustFilter) return null;

	const follows = await db.horseFollow.findMany({
		where: { organizationId, horseId },
		select: { userId: true },
	});
	return new Set(follows.map((f) => f.userId));
}
