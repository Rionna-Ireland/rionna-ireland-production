import type { OrganizationMetadata } from "@repo/database";

import { isHorseSpace, listAutoJoinSpaceIds } from "./space-settings";

/**
 * The admin-chosen `autoJoin` space ids that are actually safe to auto-join
 * members into (S12-02b final review I1).
 *
 * `listAutoJoinSpaceIds` is a pure read of `metadata.circle.spaces` and
 * trusts whatever an admin wrote there. It is still what the Stripe
 * provisioning hot path uses (`packages/payments/lib/circle-provisioning.ts`
 * can't afford a DB + Admin v2 lookup on that path), but every path that
 * *can* afford it (the sweep, the reconcile-provision pass, and the write
 * path itself in `setSpaceSettings`) must additionally exclude:
 *
 * - private spaces (`adminSpaces` — the Admin v2 `listSpaces()` summaries'
 *   `isPrivate`, since Circle's own visibility flag is the source of truth
 *   an admin can't accidentally drift), and
 * - horse spaces, detected via **both** signals per the ledger ruling: a
 *   `Horse.circleSpaceId` match (`horseSpaceIds`, from `getHorseSpaceIds`)
 *   OR the group-id check (`isHorseSpace`) — the admin-listed group id can
 *   drift from `metadata.circle.spaceGroupId`, so neither signal alone is
 *   reliable.
 *
 * Fails closed: a space with no matching entry in `adminSpaces` (Circle
 * didn't return it, or the listing failed and got passed an empty map) is
 * excluded rather than assumed safe.
 */
export function resolveAutoJoinSpaceIds(p: {
	metadata: OrganizationMetadata;
	adminSpaces: Map<string, { isPrivate: boolean; spaceGroupId: string | null }>;
	horseSpaceIds: Set<string>;
}): string[] {
	const { metadata, adminSpaces, horseSpaceIds } = p;

	return listAutoJoinSpaceIds(metadata).filter((spaceId) => {
		const space = adminSpaces.get(spaceId);
		if (!space) return false;
		if (space.isPrivate) return false;
		if (horseSpaceIds.has(spaceId)) return false;
		if (isHorseSpace(metadata, { spaceGroupId: space.spaceGroupId })) return false;
		return true;
	});
}
