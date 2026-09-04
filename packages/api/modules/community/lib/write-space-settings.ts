import { db, parseOrgMetadata } from "@repo/database";

export interface SpaceSettingsPatch {
	memberPosting?: boolean;
	hideChip?: boolean;
}

export interface SpaceSettings {
	memberPosting: boolean;
	hideChip: boolean;
}

/**
 * Merge a patch into `metadata.circle.spaces[spaceId]`, preserving other
 * spaces and other keys on this space, then persist. Missing fields default
 * to `false` (opt-in, not opt-out — see `OrganizationMetadata.circle.spaces`).
 *
 * Shared by `admin.community.setSpaceSettings` and horse-space provisioning
 * (new horse spaces default `memberPosting: true`).
 */
export async function mergeSpaceSettings(p: {
	organizationId: string;
	spaceId: string;
	patch: SpaceSettingsPatch;
}): Promise<SpaceSettings> {
	const org = await db.organization.findUnique({ where: { id: p.organizationId } });
	if (!org) {
		throw new Error(`Organization ${p.organizationId} not found`);
	}
	const metadata = parseOrgMetadata(org.metadata as string | null);
	const existing = metadata.circle?.spaces?.[p.spaceId] ?? {};
	const merged: SpaceSettings = {
		memberPosting: p.patch.memberPosting ?? existing.memberPosting ?? false,
		hideChip: p.patch.hideChip ?? existing.hideChip ?? false,
	};

	await db.organization.update({
		where: { id: p.organizationId },
		data: {
			metadata: JSON.stringify({
				...metadata,
				circle: {
					...metadata.circle,
					spaces: {
						...metadata.circle?.spaces,
						[p.spaceId]: merged,
					},
				},
			}),
		},
	});

	return merged;
}
