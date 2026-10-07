import { ACTIVE_SUBSCRIPTION_STATUSES } from "@repo/payments/lib/helper";

export type MembershipStatus = "active" | "past_due" | "cancelled" | "none";

/**
 * Maps a user's purchase statuses to the mobile-facing membership status.
 * Uses the shared ACTIVE_SUBSCRIPTION_STATUSES (active / trialing / past_due):
 * any active-or-trialing wins, then past_due; any other purchase row means the
 * membership ended (cancelled); no rows means none.
 */
export function deriveMembershipStatus(statuses: (string | null)[]): MembershipStatus {
	const present = statuses.filter((s): s is string => !!s);
	if (present.some((s) => s !== "past_due" && ACTIVE_SUBSCRIPTION_STATUSES.has(s))) {
		return "active";
	}
	if (present.includes("past_due")) return "past_due";
	if (statuses.length > 0) return "cancelled";
	return "none";
}
