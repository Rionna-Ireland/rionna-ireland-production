/**
 * Circle Horse-Space Provisioning (S2-09 surface F)
 *
 * "A horse IS a Circle space." On horse create we auto-provision a space
 * under the club's space group and link it (`Horse.circleSpaceId`). This
 * mirrors member provisioning (circle-provisioning.ts): fail-safe — it never
 * throws; any problem records `circleSpaceStatus="provisioning_failed"` so the
 * reconciliation cron retries it (S6-02 invariant I4).
 *
 * Space privacy is DERIVED from `Horse.inviteOnly` (S9-05): invite-only ⇒
 * private Circle space, open (default) ⇒ public. `circleSpaceVisibility`
 * mirrors whichever was actually sent to Circle.
 *
 * @see Architecture/specs/S2-09-admin-mission-control.md
 */

import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";

import { createCircleService } from "./circle/index";

export async function provisionHorseSpace(horse: {
	id: string;
	name: string;
	organizationId: string;
	/** Derives Circle space privacy (S9-05). Defaults to false (open/public). */
	inviteOnly?: boolean;
}): Promise<{ ok: boolean }> {
	const org = await db.organization.findUnique({
		where: { id: horse.organizationId },
	});
	if (!org?.slug) {
		logger.warn("[Circle] Organization not found for horse-space provisioning", {
			organizationId: horse.organizationId,
			horseId: horse.id,
		});
		return { ok: false };
	}

	const spaceGroupId = parseOrgMetadata(org.metadata).circle?.spaceGroupId;
	if (!spaceGroupId) {
		// Can't create a space without a group. Defer — once the operator sets
		// metadata.circle.spaceGroupId, reconciliation picks it up.
		await db.horse.update({
			where: { id: horse.id },
			data: { circleSpaceStatus: "provisioning_failed" },
		});
		logger.error("[Circle] No spaceGroupId configured; horse-space provisioning deferred", {
			surface: "circle.horse_provisioning",
			horseId: horse.id,
			organizationId: horse.organizationId,
		});
		return { ok: false };
	}

	// Space privacy is DERIVED from Horse.inviteOnly (S9-05). Default false ⇒
	// public, matching the S8-04 §4 / S8-03 open-community baseline: Circle
	// 401s a member-token self-join into a private space, so join-on-follow /
	// backfill / reconcile only work when horse spaces are member-public.
	// inviteOnly:true is the deliberate exception — those spaces are private
	// and membership is managed via Admin API v2 (addSpaceMember /
	// removeSpaceMember), which doesn't depend on member-token self-join.
	const isPrivate = horse.inviteOnly ?? false;

	const service = createCircleService(org.slug);
	const outcome = await service.createSpace({
		name: horse.name,
		spaceGroupId,
		spaceType: "basic",
		isPrivate,
		// Stable across retries so Circle deduplicates rather than creating dupes
		// (there is no delete-space API to clean them up).
		idempotencyKey: `horse-space-${horse.id}`,
		// 5-minute swagger check (2026-08-24, api-headless.circle.so/api/admin/v2/swagger.yaml):
		// Create/Update Space DOES support a hide-from-sidebar flag
		// (`hide_from_sidebar: boolean`, plus `is_hidden` / `is_hidden_from_non_members`
		// on the space settings schema, and a `secret` join_type on space groups).
		// Not used here — invite-only visibility is handled purely via
		// isPrivate/setSpaceVisibility per this task's brief; noted for any
		// future "hide from sidebar without restricting access" surface.
	});

	if (!outcome.ok) {
		await db.horse.update({
			where: { id: horse.id },
			data: { circleSpaceStatus: "provisioning_failed" },
		});
		logger.error("[Circle] Horse-space provisioning failed; deferring to reconciliation", {
			surface: "circle.horse_provisioning",
			horseId: horse.id,
			organizationId: horse.organizationId,
			reason: outcome.reason,
			retriable: outcome.retriable,
		});
		return { ok: false };
	}

	await db.horse.update({
		where: { id: horse.id },
		data: {
			circleSpaceId: outcome.data.circleSpaceId,
			circleSpaceStatus: "active",
			// Mirrors `isPrivate` above — must stay in sync with what createSpace
			// was actually asked for.
			circleSpaceVisibility: isPrivate ? "private" : "public",
			circleSpaceProvisionedAt: new Date(),
		},
	});

	logger.info("[Circle] Horse space provisioned", {
		horseId: horse.id,
		circleSpaceId: outcome.data.circleSpaceId,
	});
	return { ok: true };
}
