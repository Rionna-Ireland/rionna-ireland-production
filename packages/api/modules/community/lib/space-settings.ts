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
