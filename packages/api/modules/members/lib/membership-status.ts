import { ACTIVE_SUBSCRIPTION_STATUSES } from "@repo/payments/lib/helper";

export type MembershipStatus = "active" | "past_due" | "cancelled" | "none";

/**
 * Maps a user's purchase statuses to the mobile-facing membership status.
 * Uses the shared ACTIVE_SUBSCRIPTION_STATUSES (active / trialing / past_due):
 * any active-or-trialing wins, then past_due; a canceled/unpaid row means the
 * membership ended (cancelled). Never-paid states (incomplete,
 * incomplete_expired, rejected_d29, ...) and no rows map to none.
 */
const ENDED_STATUSES = new Set(["canceled", "unpaid"]);

export function deriveMembershipStatus(statuses: (string | null)[]): MembershipStatus {
	const present = statuses.filter((s): s is string => !!s);
	if (present.some((s) => s !== "past_due" && ACTIVE_SUBSCRIPTION_STATUSES.has(s))) {
		return "active";
	}
	if (present.includes("past_due")) return "past_due";
	if (present.some((s) => ENDED_STATUSES.has(s))) return "cancelled";
	return "none";
}

/**
 * Prisma `where` for a Member who counts as paying: their user holds an
 * active, trialing or past_due Purchase in the org. The same rule as
 * deriveMembershipStatus returning "active" or "past_due". Used by
 * memberProcedure, the news/push audiences and the Circle reconcile sweeps.
 * Without an organizationId it matches any org (D37: one club).
 */
export function activeMemberWhere(organizationId?: string) {
	return {
		organizationId,
		user: {
			purchases: {
				some: { organizationId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
			},
		},
	};
}

/** Who receives member news and pushes: paying members plus staff, who hold no Purchase (W-16). */
export function memberAudienceWhere(organizationId: string) {
	return {
		OR: [
			activeMemberWhere(organizationId),
			{ organizationId, user: { role: { in: ["admin", "platformAdmin"] } } },
		],
	};
}
