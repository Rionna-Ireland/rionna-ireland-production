// Priority order — the "best" current standing wins when a member has several
// purchase rows (e.g. an old canceled sub + a current past_due one).
const STATUS_PRIORITY = ["active", "trialing", "past_due", "canceled", "expired"] as const;

/**
 * Statuses that count as a current member (S12-10 decision 3): a member whose
 * payment is failing still counts while Stripe retries.
 */
export const CURRENT_MEMBER_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

export function pickSubscriptionStatus(statuses: string[]): string {
	for (const status of STATUS_PRIORITY) {
		if (statuses.includes(status)) return status;
	}
	return statuses[0] ?? "none";
}

/** Groups purchase statuses by user id (rows without a user or status are skipped). */
export function groupStatusesByUser(
	purchases: { userId: string | null; status: string | null }[],
): Map<string, string[]> {
	const statusesByUser = new Map<string, string[]>();
	for (const purchase of purchases) {
		if (!purchase.userId || !purchase.status) continue;
		const list = statusesByUser.get(purchase.userId) ?? [];
		list.push(purchase.status);
		statusesByUser.set(purchase.userId, list);
	}
	return statusesByUser;
}
