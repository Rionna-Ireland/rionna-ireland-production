import { getFollowedHorseIds } from "./horse-follows";

/**
 * S9-05 — server-side ACCESS layer for invite-only horses. A member can see
 * an invite-only horse only if they follow it (the HorseFollow row is the
 * admin-granted invite).
 *
 * Kill-switch-independent: this is access control, not the follow-filter
 * *preference*. `features.horseFollows` (S8-04 §5) toggles whether members
 * can self-serve follow/unfollow a horse and whether the feed applies the
 * follow filter to open horses — it must never affect whether an invite-only
 * horse is visible. This module therefore never imports or consults
 * `horseFollowsEnabled`.
 */

export interface AccessibleHorseWhere {
	OR: [{ inviteOnly: false }, { id: { in: string[] } }];
}

/**
 * A Prisma `where` fragment matching horses the given user may see: every
 * non-invite-only horse, plus any invite-only horse they follow. Splice this
 * into a query's `where` (e.g. `{ ...baseWhere, ...(await getAccessibleHorseWhere(...)) }`
 * or, for a relation filter, `{ horse: await getAccessibleHorseWhere(...) }`).
 */
export async function getAccessibleHorseWhere(params: {
	organizationId: string;
	userId: string;
}): Promise<AccessibleHorseWhere> {
	const followed = await getFollowedHorseIds(params);
	return { OR: [{ inviteOnly: false }, { id: { in: Array.from(followed) } }] };
}

/** Whether the given user may see this specific horse. */
export async function canAccessHorse(params: {
	organizationId: string;
	userId: string;
	horse: { id: string; inviteOnly: boolean };
}): Promise<boolean> {
	if (!params.horse.inviteOnly) return true;
	const followed = await getFollowedHorseIds({
		organizationId: params.organizationId,
		userId: params.userId,
	});
	return followed.has(params.horse.id);
}
