/**
 * Circle Member Provisioning Orchestration
 *
 * These functions coordinate between the CircleService interface and
 * Prisma. Called from Stripe webhook handlers (S1-04) and the auth
 * deletion hook.
 *
 * @see Architecture/specs/S1-05-circle-provisioning.md
 */

import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";

import { createCircleService } from "./circle/index";

/**
 * Provision a new member in Circle.
 * Called from Stripe webhook handler on subscription.created.
 */
export async function provisionCircleMember(
	member: { id: string; userId: string; organizationId: string },
	idempotencyKey: string,
): Promise<void> {
	const org = await db.organization.findUnique({
		where: { id: member.organizationId },
	});
	if (!org?.slug) {
		logger.warn("[Circle] Organization not found for provisioning", {
			organizationId: member.organizationId,
		});
		return;
	}

	const service = createCircleService(org.slug);

	const user = await db.user.findUnique({ where: { id: member.userId } });
	if (!user) {
		logger.warn("[Circle] User not found for provisioning", {
			userId: member.userId,
		});
		return;
	}

	const outcome = await service.createMember({
		email: user.email,
		name: user.name ?? user.email,
		ssoUserId: user.id,
		idempotencyKey,
	});

	if (!outcome.ok) {
		// Don't throw — let the Stripe webhook succeed so Stripe doesn't retry.
		// Mark the member so S1-06 reconciliation picks up the provisioning
		// work on the next cron tick (ticket D9 — no heroic retries in the hot path).
		await db.member.update({
			where: { id: member.id },
			data: {
				circleMemberId: null,
				circleStatus: "provisioning_failed",
			},
		});
		logger.error("[Circle] Member provisioning failed; deferring to reconciliation", {
			surface: "circle.provisioning",
			memberId: member.id,
			userId: member.userId,
			organizationId: member.organizationId,
			reason: outcome.reason,
			retriable: outcome.retriable,
		});
		return;
	}

	await db.member.update({
		where: { id: member.id },
		data: {
			circleMemberId: outcome.data.circleMemberId,
			circleProvisionedAt: new Date(),
			circleStatus: "active",
		},
	});

	// Pre-confirm the new member's Circle profile so they don't hit the signup
	// profile gate on their first session. Fail-open: a confirm failure must
	// never throw or block provisioning — reconciliation/lazy confirm covers it.
	const confirm = await service.confirmMemberProfile(
		outcome.data.circleMemberId,
		user.name ?? user.email,
	);
	if (confirm.ok) {
		await db.member.update({
			where: { id: member.id },
			data: { circleProfileConfirmedAt: new Date() },
		});
	} else {
		logger.warn(
			"[Circle] Profile pre-confirm failed; will retry lazily on first session",
			{
				surface: "circle.provisioning",
				memberId: member.id,
				reason: confirm.reason,
			},
		);
	}

	// S6-07 Surface D: auto-follow the new member to every published horse in
	// the org unless the admin has turned it off (metadata.horseAutoFollow,
	// default true when unset). Fail-safe: wrapped in try/catch so any error
	// is logged and swallowed — provisioning has already succeeded above and
	// must not be blocked or rolled back by this step.
	//
	// NOTE: the DRY follow helpers live in @repo/api
	// (modules/racing/horses/lib/horse-follows.ts) but are intentionally NOT
	// imported here — @repo/payments must not depend on @repo/api, that would
	// create a package import cycle. The single createMany call is inlined.
	try {
		const horseAutoFollow = parseOrgMetadata(org.metadata ?? null).horseAutoFollow;
		if (horseAutoFollow !== false) {
			const publishedHorses = await db.horse.findMany({
				where: { organizationId: member.organizationId, publishedAt: { not: null } },
				select: { id: true },
			});
			if (publishedHorses.length > 0) {
				await db.horseFollow.createMany({
					data: publishedHorses.map((horse) => ({
						organizationId: member.organizationId,
						userId: member.userId,
						horseId: horse.id,
					})),
					skipDuplicates: true,
				});
			}
		}
	} catch (error) {
		logger.warn("[Circle] Horse auto-follow failed; continuing without blocking provisioning", {
			surface: "circle.provisioning",
			memberId: member.id,
			organizationId: member.organizationId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	logger.info("[Circle] Member provisioned", {
		memberId: member.id,
		circleMemberId: outcome.data.circleMemberId,
	});
}

/**
 * Deactivate a member in Circle (preserves their posts).
 * Called on subscription.deleted and from the guided-removal flow (S2-10).
 *
 * Returns true when the member was deactivated, false when it failed (and was
 * deferred to reconciliation). The webhook caller ignores the result; the
 * guided-removal orchestration uses it to decide whether to proceed to the
 * irreversible Member-row delete.
 */
export async function deactivateCircleMember(
	member: { id: string; circleMemberId: string },
): Promise<boolean> {
	const dbMember = await db.member.findUnique({
		where: { id: member.id },
		include: { organization: true },
	});
	if (!dbMember?.organization?.slug) return false;

	const service = createCircleService(dbMember.organization.slug);
	const outcome = await service.deactivateMember(member.circleMemberId);

	if (!outcome.ok) {
		// Don't throw — reconciliation will retry on next tick.
		logger.error(
			"[Circle] Member deactivation failed; deferring to reconciliation",
			{
				surface: "circle.provisioning",
				memberId: member.id,
				organizationId: dbMember.organizationId,
				circleMemberId: member.circleMemberId,
				reason: outcome.reason,
				retriable: outcome.retriable,
			},
		);
		return false;
	}

	await db.member.update({
		where: { id: member.id },
		data: { circleStatus: "deactivated" },
	});

	logger.info("[Circle] Member deactivated", {
		memberId: member.id,
		circleMemberId: member.circleMemberId,
	});

	return true;
}

/**
 * Reactivate a member in Circle.
 * Called when subscription transitions from canceled to active.
 */
export async function reactivateCircleMember(
	member: { id: string; circleMemberId: string },
): Promise<void> {
	const dbMember = await db.member.findUnique({
		where: { id: member.id },
		include: { organization: true },
	});
	if (!dbMember?.organization?.slug) return;

	const user = await db.user.findUnique({ where: { id: dbMember.userId } });
	if (!user) return;

	const service = createCircleService(dbMember.organization.slug);
	const outcome = await service.reactivateMember({
		email: user.email,
		name: user.name ?? user.email,
		ssoUserId: user.id,
		// Stable across retries so Circle deduplicates reactivation requests.
		idempotencyKey: `reactivate-${member.id}`,
	});

	if (!outcome.ok) {
		logger.error(
			"[Circle] Member reactivation failed; deferring to reconciliation",
			{
				surface: "circle.provisioning",
				memberId: member.id,
				organizationId: dbMember.organizationId,
				circleMemberId: member.circleMemberId,
				reason: outcome.reason,
				retriable: outcome.retriable,
			},
		);
		return;
	}

	await db.member.update({
		where: { id: member.id },
		data: { circleStatus: "active" },
	});

	logger.info("[Circle] Member reactivated", {
		memberId: member.id,
		circleMemberId: member.circleMemberId,
	});
}

/**
 * Delete a member and all their content from Circle.
 * Called from user deletion hook (GDPR).
 */
export async function deleteCircleMember(
	circleMemberId: string,
): Promise<void> {
	const member = await db.member.findFirst({
		where: { circleMemberId },
		include: { organization: true },
	});
	if (!member?.organization?.slug) {
		logger.warn("[Circle] No member found for Circle ID during deletion", {
			circleMemberId,
		});
		return;
	}

	const service = createCircleService(member.organization.slug);
	const outcome = await service.deleteMember(circleMemberId);

	if (!outcome.ok) {
		logger.error("[Circle] Member deletion failed", {
			surface: "circle.provisioning",
			circleMemberId,
			memberId: member.id,
			organizationId: member.organizationId,
			reason: outcome.reason,
			retriable: outcome.retriable,
		});
		return;
	}

	logger.info("[Circle] Member deleted", { circleMemberId });
}
