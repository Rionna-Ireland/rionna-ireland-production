/**
 * Circle/Stripe Reconciliation
 *
 * Safety net that runs daily to catch anything the Stripe webhook
 * hot path missed (D9: "No heroic retry logic in the webhook hot path").
 *
 * Two sweeps per organization:
 * 1. Provision: active Purchase but no circleMemberId → create in Circle
 * 2. Deactivate: canceled/expired Purchase but circleStatus = "active" → remove from Circle
 *
 * Each member is processed independently — one failure doesn't block others.
 *
 * @see Architecture/specs/S1-06-reconciliation-cron.md
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import { provisionHorseSpace } from "@repo/payments/lib/circle-horse-provisioning";

export async function reconcileCircleMembers(
	organizationId: string,
): Promise<{ provisioned: number; deactivated: number; errors: number }> {
	const org = await db.organization.findUnique({
		where: { id: organizationId },
	});
	if (!org?.slug) {
		logger.warn("[Reconciliation] Organization not found or missing slug", {
			surface: "circle.reconciliation",
			organizationId,
		});
		return { provisioned: 0, deactivated: 0, errors: 0 };
	}

	const circle = createCircleService(org.slug);

	let provisioned = 0;
	let deactivated = 0;
	let errors = 0;

	// 1. Active Purchase but no circleMemberId → provision
	const unprovisionedMembers = await db.member.findMany({
		where: {
			organizationId,
			circleMemberId: null,
			user: {
				purchases: {
					some: {
						organizationId,
						status: { in: ["active", "trialing", "past_due"] },
					},
				},
			},
		},
		include: { user: true },
	});

	for (const member of unprovisionedMembers) {
		// Track whether this member was already marked as a prior provisioning
		// failure. If so, a second failure here is a "repeat" — we emit a
		// distinct event so ops/alerting can surface Members that are stuck.
		const wasPreviouslyFailed = member.circleStatus === "provisioning_failed";

		try {
			const outcome = await circle.createMember({
				email: member.user.email,
				name: member.user.name ?? member.user.email,
				ssoUserId: member.userId,
				idempotencyKey: `reconcile-provision-${member.id}`,
			});

			if (!outcome.ok) {
				errors++;
				logger.error("[Reconciliation] Failed to provision member", {
					surface: "circle.reconciliation",
					memberId: member.id,
					userId: member.userId,
					orgId: organizationId,
					reason: outcome.reason,
					retriable: outcome.retriable,
				});
				if (!outcome.retriable) {
					// Non-retriable failure — mark the member so we don't keep
					// hammering Circle every cron tick. Drift alerts / manual
					// ops can surface these.
					await db.member.update({
						where: { id: member.id },
						data: { circleStatus: "provisioning_failed" },
					});
				}
				if (wasPreviouslyFailed) {
					// Repeat failure — Member has now failed provisioning in at
					// least two reconciliation sweeps. This is the signal for
					// ops/on-call; Sentry capture wires in via @repo/logs when
					// that bridge lands (S5-01).
					logger.error("circle.provisioning.failed_permanent", {
						surface: "circle.reconciliation",
						memberId: member.id,
						userId: member.userId,
						orgId: organizationId,
						circleStatus: "provisioning_failed",
						reason: outcome.reason,
						retriable: outcome.retriable,
					});
				}
				continue;
			}

			await db.member.update({
				where: { id: member.id },
				data: {
					circleMemberId: outcome.data.circleMemberId,
					circleProvisionedAt: new Date(),
					circleStatus: "active",
				},
			});

			provisioned++;
			logger.info("[Reconciliation] Provisioned Circle member", {
				surface: "circle.reconciliation",
				memberId: member.id,
				userId: member.userId,
				orgId: organizationId,
				circleMemberId: outcome.data.circleMemberId,
			});
		} catch (error) {
			errors++;
			logger.error("[Reconciliation] Failed to provision member", {
				surface: "circle.reconciliation",
				memberId: member.id,
				userId: member.userId,
				orgId: organizationId,
				error: error instanceof Error ? error.message : String(error),
			});
			if (wasPreviouslyFailed) {
				logger.error("circle.provisioning.failed_permanent", {
					surface: "circle.reconciliation",
					memberId: member.id,
					userId: member.userId,
					orgId: organizationId,
					circleStatus: "provisioning_failed",
					reason: "server_error",
					retriable: false,
				});
			}
		}
	}

	// 2. Canceled/expired Purchase but circleStatus = "active" → deactivate
	const staleActiveMembers = await db.member.findMany({
		where: {
			organizationId,
			circleStatus: "active",
			circleMemberId: { not: null },
			user: {
				purchases: {
					some: {
						organizationId,
						status: { in: ["canceled", "expired"] },
					},
					none: {
						organizationId,
						status: { in: ["active", "trialing", "past_due"] },
					},
				},
			},
		},
	});

	for (const member of staleActiveMembers) {
		try {
			const outcome = await circle.deactivateMember(member.circleMemberId!);

			if (!outcome.ok) {
				errors++;
				logger.error("[Reconciliation] Failed to deactivate member", {
					surface: "circle.reconciliation",
					memberId: member.id,
					userId: member.userId,
					orgId: organizationId,
					reason: outcome.reason,
					retriable: outcome.retriable,
				});
				continue;
			}

			await db.member.update({
				where: { id: member.id },
				data: { circleStatus: "deactivated" },
			});

			deactivated++;
			logger.info("[Reconciliation] Deactivated Circle member", {
				surface: "circle.reconciliation",
				memberId: member.id,
				userId: member.userId,
				orgId: organizationId,
				circleMemberId: member.circleMemberId,
			});
		} catch (error) {
			errors++;
			logger.error("[Reconciliation] Failed to deactivate member", {
				surface: "circle.reconciliation",
				memberId: member.id,
				userId: member.userId,
				orgId: organizationId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { provisioned, deactivated, errors };
}

/**
 * Retry horse-space provisioning that the create-horse hot path couldn't
 * complete (Circle was down, or `metadata.circle.spaceGroupId` wasn't set yet).
 * Scans horses with no linked space and a null/failed status; each is retried
 * independently via the fail-safe provisioning fn. (S2-09 surface F.)
 */
export async function reconcileCircleHorseSpaces(
	organizationId: string,
): Promise<{ provisioned: number; errors: number }> {
	const horses = await db.horse.findMany({
		where: {
			organizationId,
			circleSpaceId: null,
			OR: [{ circleSpaceStatus: null }, { circleSpaceStatus: "provisioning_failed" }],
		},
		select: { id: true, name: true, organizationId: true },
	});

	let provisioned = 0;
	let errors = 0;

	for (const horse of horses) {
		try {
			const result = await provisionHorseSpace(horse);
			if (result.ok) {
				provisioned++;
				logger.info("[Reconciliation] Provisioned horse space", {
					surface: "circle.reconciliation",
					horseId: horse.id,
					orgId: organizationId,
				});
			} else {
				errors++;
			}
		} catch (error) {
			errors++;
			logger.error("[Reconciliation] Failed to provision horse space", {
				surface: "circle.reconciliation",
				horseId: horse.id,
				orgId: organizationId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { provisioned, errors };
}
