import { getCurrentCharityConfig, listOrgIdsWithCurrentCharity, setCharityRevenue } from "@repo/database";
import { logger } from "@repo/logs";

import { sumPaidSubscriptionRevenueCents } from "./stripe-revenue";

export type SyncCharityRevenueResult =
	| { ok: true; configId: string; stripeRevenueCents: number; syncedAt: Date }
	| { ok: false; reason: "no_current_charity" | "stripe_error" };

/**
 * Refreshes the cached Stripe revenue figure on the org's current charity config.
 * Shared by the daily cron and the admin "Recalculate now" (S12-01 decision 1).
 * Never throws — a Stripe failure leaves the previous cached figure in place.
 */
export async function syncCharityRevenue(args: { organizationId: string }): Promise<SyncCharityRevenueResult> {
	const config = await getCurrentCharityConfig({ organizationId: args.organizationId });
	if (!config) return { ok: false, reason: "no_current_charity" };
	try {
		const stripeRevenueCents = await sumPaidSubscriptionRevenueCents({ since: config.startDate });
		const syncedAt = new Date();
		await setCharityRevenue({ configId: config.id, stripeRevenueCents, syncedAt });
		logger.info("[Charity] revenue synced", { organizationId: args.organizationId, configId: config.id, stripeRevenueCents });
		return { ok: true, configId: config.id, stripeRevenueCents, syncedAt };
	} catch (error) {
		logger.error("[Charity] revenue sync failed", { organizationId: args.organizationId, configId: config.id, error: String(error) });
		return { ok: false, reason: "stripe_error" };
	}
}

export async function syncAllCharityRevenue(): Promise<{ orgs: number; synced: number; failed: number }> {
	const orgIds = await listOrgIdsWithCurrentCharity();
	let synced = 0;
	let failed = 0;
	for (const organizationId of orgIds) {
		const result = await syncCharityRevenue({ organizationId });
		if (result.ok) synced += 1;
		else failed += 1;
	}
	return { orgs: orgIds.length, synced, failed };
}
