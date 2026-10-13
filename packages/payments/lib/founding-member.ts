/**
 * Founding member assignment (S13-12).
 *
 * The first FOUNDING_MEMBER_CAP non-staff members of a club are founding
 * members. Assignment is automatic when a member's first paid membership
 * activates; admins can toggle the flag either way afterwards. The cap counts
 * flagged non-staff members (flags, not dates).
 *
 * Race safety: the count-then-flag runs inside a transaction holding a
 * per-organization Postgres advisory lock (`pg_advisory_xact_lock`), so two
 * concurrent activations serialise and can't both take the last slot.
 *
 * @see Architecture/specs/S13-12-membership-details.md
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";

export const FOUNDING_MEMBER_CAP = 25;

/** Better-Auth org roles that make a member "staff" (excluded from the cap). */
export const STAFF_MEMBER_ROLES = ["owner", "admin"];
/** Global user roles that make an account "staff" (excluded from the cap). */
export const STAFF_USER_ROLES = ["admin", "platformAdmin"];

/** Prisma `where` fragment matching non-staff members. */
export const NON_STAFF_MEMBER_WHERE = {
	role: { notIn: STAFF_MEMBER_ROLES },
	user: { OR: [{ role: null }, { role: { notIn: STAFF_USER_ROLES } }] },
};

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export type FoundingAssignmentResult =
	| "assigned"
	| "already_flagged"
	| "staff"
	| "not_first_membership"
	| "cap_reached"
	| "member_not_found";

/**
 * Take the per-org lock and, if a slot is free, flag the member. MUST be called
 * inside a transaction (the advisory lock is transaction-scoped).
 */
export async function assignFoundingMemberInTx(
	tx: Tx,
	memberId: string,
	options: { requireFirstMembership?: boolean } = {},
): Promise<FoundingAssignmentResult> {
	const member = await tx.member.findUnique({
		where: { id: memberId },
		select: {
			id: true,
			organizationId: true,
			userId: true,
			role: true,
			foundingMember: true,
			user: { select: { role: true } },
		},
	});
	if (!member) return "member_not_found";

	await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`founding-member:${member.organizationId}`}))`;

	// Re-read the flag under the lock so a concurrent winner is respected.
	const fresh = await tx.member.findUnique({
		where: { id: memberId },
		select: { foundingMember: true },
	});
	if (fresh?.foundingMember) return "already_flagged";

	const isStaff =
		STAFF_MEMBER_ROLES.includes(member.role) ||
		(member.user?.role != null && STAFF_USER_ROLES.includes(member.user.role));
	if (isStaff) return "staff";

	if (options.requireFirstMembership) {
		// More than one purchase row for this user+org means this isn't their
		// first paid membership (e.g. a re-subscribe after cancelling).
		const purchaseCount = await tx.purchase.count({
			where: {
				organizationId: member.organizationId,
				userId: member.userId,
				type: "SUBSCRIPTION",
			},
		});
		if (purchaseCount > 1) return "not_first_membership";
	}

	const flagged = await tx.member.count({
		where: {
			organizationId: member.organizationId,
			foundingMember: true,
			...NON_STAFF_MEMBER_WHERE,
		},
	});
	if (flagged >= FOUNDING_MEMBER_CAP) return "cap_reached";

	await tx.member.update({ where: { id: memberId }, data: { foundingMember: true } });
	return "assigned";
}

/**
 * Webhook-facing wrapper. Never throws: a failure here must not fail the Stripe
 * webhook (an admin can flag manually / the backfill script can repair).
 */
export async function assignFoundingMemberIfEligible(
	memberId: string,
): Promise<FoundingAssignmentResult | "error"> {
	try {
		const result = await db.$transaction((tx) =>
			assignFoundingMemberInTx(tx, memberId, { requireFirstMembership: true }),
		);
		if (result === "assigned") {
			logger.info("[FoundingMember] Member flagged as founding member", { memberId });
		}
		return result;
	} catch (error) {
		logger.error("[FoundingMember] Assignment failed", {
			surface: "founding-member",
			memberId,
			error: error instanceof Error ? error.message : String(error),
		});
		return "error";
	}
}
