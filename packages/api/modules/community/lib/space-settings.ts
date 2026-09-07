import type { OrganizationMetadata } from "@repo/database";

/**
 * Org-metadata gates for member posting (S12-02a).
 *
 * `metadata.circle.spaces` is keyed by Circle space id. Missing entry ⇒
 * `memberPosting` false (opt-in, not opt-out) — see the field's doc comment on
 * `OrganizationMetadata.circle.spaces`.
 */
export function isMemberPostingAllowed(metadata: OrganizationMetadata, spaceId: string): boolean {
	return metadata.circle?.spaces?.[spaceId]?.memberPosting === true;
}

/** Whether a space is one of the per-horse discussion spaces. */
export function isHorseSpace(
	metadata: OrganizationMetadata,
	space: { spaceGroupId: string | null },
): boolean {
	return (
		space.spaceGroupId !== null && space.spaceGroupId === metadata.circle?.spaceGroupId
	);
}

/**
 * Circle only grants `can_create_post` to members who have *joined* a space,
 * and nothing auto-joins members into the general spaces. For a non-member
 * the member-token listing also reports `is_post_disabled: true` — that flag
 * is viewer-relative ("posts disabled for you"), NOT the space setting — so
 * it is ignored until the member has joined. A public space the member
 * hasn't joined is therefore still postable: `createPost` joins them (Admin
 * v2 `addSpaceMember`) and re-checks the real policy before creating the
 * post. Private spaces are admin-managed and never auto-joined.
 */
export function needsJoinToPost(space: {
	canCreatePost: boolean;
	isMember: boolean;
	isPrivate: boolean;
}): boolean {
	return !space.canCreatePost && !space.isMember && !space.isPrivate;
}

export function isPostableForMember(space: {
	canCreatePost: boolean;
	isMember: boolean;
	isPrivate: boolean;
	isPostDisabled: boolean;
}): boolean {
	if (space.isMember) return space.canCreatePost && !space.isPostDisabled;
	return needsJoinToPost(space);
}
