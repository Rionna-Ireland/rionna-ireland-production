import { db, parseOrgMetadata } from "@repo/database";

export interface SpaceSettingsPatch {
	memberPosting?: boolean;
	hideChip?: boolean;
}

export interface SpaceSettings {
	memberPosting: boolean;
	hideChip: boolean;
}

const MAX_ATTEMPTS = 3;

/**
 * Merge a patch into `metadata.circle.spaces[spaceId]`, preserving other
 * spaces and other keys on this space, then persist. Missing fields default
 * to `false` (opt-in, not opt-out — see `OrganizationMetadata.circle.spaces`).
 *
 * Shared by `admin.community.setSpaceSettings` and horse-space provisioning
 * (new horse spaces default `memberPosting: true`).
 *
 * Compare-and-set: `metadata` is a single string column with two concurrent
 * writers (admin toggles + horse provisioning), so the read-modify-write is
 * guarded by an `updateMany` gated on the exact raw string just read. If
 * another writer landed a change in between, `count` comes back 0 and we
 * re-read and retry (up to `MAX_ATTEMPTS`) instead of silently clobbering it.
 */
export async function mergeSpaceSettings(p: {
	organizationId: string;
	spaceId: string;
	patch: SpaceSettingsPatch;
}): Promise<SpaceSettings> {
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const org = await db.organization.findUnique({ where: { id: p.organizationId } });
		if (!org) {
			throw new Error(`Organization ${p.organizationId} not found`);
		}
		const rawMetadata = org.metadata as string | null;
		const metadata = parseOrgMetadata(rawMetadata);
		const existing = metadata.circle?.spaces?.[p.spaceId] ?? {};
		const merged: SpaceSettings = {
			memberPosting: p.patch.memberPosting ?? existing.memberPosting ?? false,
			hideChip: p.patch.hideChip ?? existing.hideChip ?? false,
		};

		const { count } = await db.organization.updateMany({
			where: { id: p.organizationId, metadata: rawMetadata },
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

		if (count > 0) {
			return merged;
		}
	}

	throw new Error(
		`mergeSpaceSettings: could not update organization ${p.organizationId} metadata after ${MAX_ATTEMPTS} attempts (concurrent writer)`,
	);
}
