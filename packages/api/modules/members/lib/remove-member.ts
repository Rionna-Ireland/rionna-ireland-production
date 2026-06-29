/**
 * S2-10: Guided "Remove from membership" orchestration.
 *
 * Cancels the member's Stripe subscription, deactivates their Circle space
 * (inline, before deleting the row — the webhook resolves circleMemberId via
 * the Member row, so it must still exist), then hard-deletes the Better-Auth
 * Member row. Returns a per-system { stripe, circle, app } summary so the
 * confirmation wizard can show what actually happened.
 *
 * @see Architecture/specs/S2-10-guided-member-removal.md
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { deactivateCircleMember } from "@repo/payments/lib/circle-provisioning";
import { cancelSubscription } from "@repo/payments/provider/stripe";

const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"];

// Better-Auth org roles that hold privileged access. Removing the last one would
// orphan the organization, so it's guarded.
const PRIVILEGED_ROLES = ["owner", "admin"];

export type RemovalStepResult = "ok" | "skipped" | "failed";

export interface RemoveMemberResult {
	stripe: RemovalStepResult;
	circle: RemovalStepResult;
	app: RemovalStepResult;
}

export type RemoveMemberErrorCode =
	| "member_not_found"
	| "self_removal"
	| "last_admin";

export class RemoveMemberError extends Error {
	constructor(
		public readonly code: RemoveMemberErrorCode,
		message: string,
	) {
		super(message);
		this.name = "RemoveMemberError";
	}
}

export async function removeMember(params: {
	memberId: string;
	organizationId: string;
	actorUserId: string;
}): Promise<RemoveMemberResult> {
	const { memberId, organizationId, actorUserId } = params;

	const member = await db.member.findUnique({ where: { id: memberId } });
	if (!member || member.organizationId !== organizationId) {
		throw new RemoveMemberError(
			"member_not_found",
			"Member not found in this organization",
		);
	}

	if (member.userId === actorUserId) {
		throw new RemoveMemberError(
			"self_removal",
			"You cannot remove your own membership",
		);
	}

	if (PRIVILEGED_ROLES.includes(member.role)) {
		const privilegedCount = await db.member.count({
			where: { organizationId, role: { in: PRIVILEGED_ROLES } },
		});
		if (privilegedCount <= 1) {
			throw new RemoveMemberError(
				"last_admin",
				"Cannot remove the last owner/admin of the organization",
			);
		}
	}

	// Each step is independent and the wizard is resumable: on any failure we
	// stop before the next (irreversible) step and surface the partial state, so
	// re-running picks up where it left off. We never throw past the guards.

	// 1. Cancel the Stripe subscription (immediate). Skip when there's nothing
	// active to cancel (already canceled / past member / never subscribed). If
	// the cancel fails, abort before touching anything else.
	let stripe: RemovalStepResult = "skipped";
	const activePurchase = await db.purchase.findFirst({
		where: {
			organizationId,
			userId: member.userId,
			subscriptionId: { not: null },
			status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
		},
	});
	if (activePurchase?.subscriptionId) {
		try {
			await cancelSubscription(activePurchase.subscriptionId);
			stripe = "ok";
		} catch {
			return { stripe: "failed", circle: "skipped", app: "skipped" };
		}
	}

	// 2. Deactivate the Circle space INLINE, before deleting the Member row —
	// the subscription.deleted webhook resolves circleMemberId via the row, so it
	// must still exist. Skip when there's no space or it's already deactivated.
	// If deactivation fails, abort before the delete so the row survives and the
	// webhook (or a re-run) can still retry Circle via circleMemberId.
	let circle: RemovalStepResult = "skipped";
	if (member.circleMemberId && member.circleStatus === "active") {
		const ok = await deactivateCircleMember({
			id: member.id,
			circleMemberId: member.circleMemberId,
		});
		if (!ok) {
			return { stripe, circle: "failed", app: "skipped" };
		}
		circle = "ok";
	}

	// 3. Hard-delete the Better-Auth Member row (binary membership; this is what
	// actually revokes access across all roles, incl. paywall-exempt admins).
	let app: RemovalStepResult = "ok";
	try {
		await db.member.delete({ where: { id: memberId } });
	} catch {
		app = "failed";
	}

	const result: RemoveMemberResult = { stripe, circle, app };
	logger.info("Admin removed member from organization", {
		event: "admin_member_removed",
		actorUserId,
		organizationId,
		memberId,
		removedUserId: member.userId,
		result,
	});

	return result;
}
