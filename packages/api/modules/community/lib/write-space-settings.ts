import { db, parseOrgMetadata } from "@repo/database";
import type { OrganizationMetadata } from "@repo/database/types";

export interface SpaceSettingsPatch {
	memberPosting?: boolean;
	hideChip?: boolean;
	autoJoin?: boolean;
}

export interface SpaceSettings {
	memberPosting: boolean;
	hideChip: boolean;
	autoJoin: boolean;
}

const MAX_ATTEMPTS = 3;

/**
 * Compare-and-set read-modify-write over an org's `metadata` column.
 *
 * `metadata` is a single string column with multiple concurrent writers
 * (admin toggles, horse provisioning, the auto-join reconcile cursor), so a
 * plain read + `db.organization.update` can silently clobber a concurrent
 * writer's change. Instead the write is guarded by an `updateMany` gated on
 * the exact raw string just read — if another writer landed a change in
 * between, `count` comes back 0 and we re-read and retry (up to
 * `MAX_ATTEMPTS`) instead of clobbering it.
 *
 * `mutate` receives the freshly-parsed metadata and returns the full
 * replacement metadata object (not a patch) — callers spread `...metadata`
 * themselves so they control exactly what's preserved.
 *
 * Throws (never gives up silently) after `MAX_ATTEMPTS` straight misses —
 * callers that must not throw (e.g. a best-effort cursor write) should catch
 * and log instead of propagating.
 */
export async function mergeOrgMetadata(p: {
	organizationId: string;
	mutate: (metadata: OrganizationMetadata) => OrganizationMetadata;
}): Promise<OrganizationMetadata> {
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const org = await db.organization.findUnique({ where: { id: p.organizationId } });
		if (!org) {
			throw new Error(`Organization ${p.organizationId} not found`);
		}
		const rawMetadata = org.metadata as string | null;
		const metadata = parseOrgMetadata(rawMetadata);
		const next = p.mutate(metadata);

		const { count } = await db.organization.updateMany({
			where: { id: p.organizationId, metadata: rawMetadata },
			data: { metadata: JSON.stringify(next) },
		});

		if (count > 0) {
			return next;
		}
	}

	throw new Error(
		`mergeOrgMetadata: could not update organization ${p.organizationId} metadata after ${MAX_ATTEMPTS} attempts (concurrent writer)`,
	);
}

/**
 * Merge a patch into `metadata.circle.spaces[spaceId]`, preserving other
 * spaces and other keys on this space, then persist. Missing fields default
 * to `false` (opt-in, not opt-out — see `OrganizationMetadata.circle.spaces`).
 *
 * Shared by `admin.community.setSpaceSettings` and horse-space provisioning
 * (new horse spaces default `memberPosting: true`). Built on `mergeOrgMetadata`
 * for the compare-and-set retry loop.
 */
export async function mergeSpaceSettings(p: {
	organizationId: string;
	spaceId: string;
	patch: SpaceSettingsPatch;
}): Promise<SpaceSettings> {
	let merged: SpaceSettings | undefined;

	await mergeOrgMetadata({
		organizationId: p.organizationId,
		mutate: (metadata) => {
			const existing = metadata.circle?.spaces?.[p.spaceId] ?? {};
			merged = {
				memberPosting: p.patch.memberPosting ?? existing.memberPosting ?? false,
				hideChip: p.patch.hideChip ?? existing.hideChip ?? false,
				autoJoin: p.patch.autoJoin ?? existing.autoJoin ?? false,
			};
			return {
				...metadata,
				circle: {
					...metadata.circle,
					spaces: {
						...metadata.circle?.spaces,
						[p.spaceId]: merged,
					},
				},
			};
		},
	});

	// `merged` is always set by `mutate` above before `mergeOrgMetadata`
	// returns successfully (it throws instead of resolving on exhaustion).
	return merged as SpaceSettings;
}
