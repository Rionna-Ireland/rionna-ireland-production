import { getCurrentCharityConfig, listOrgIdsWithCurrentCharity, setCharityRevenue } from "@repo/database";
import { logger } from "@repo/logs";

import { sumPaidSubscriptionRevenueCents } from "./stripe-revenue";

export type SyncCharityRevenueResult =
	| { ok: true; configId: string; stripeRevenueCents: number; syncedAt: Date }
	| { ok: false; reason: "no_current_charity" | "stripe_error" };

type SumFn = (args: { since: Date }) => Promise<number>;

/**
 * Refreshes the cached Stripe revenue figure on the org's current charity config.
 * Shared by the daily cron and the admin "Recalculate now" (S12-01 decision 1).
 * Never throws — a Stripe failure leaves the previous cached figure in place.
 *
 * `sum` defaults to a fresh Stripe walk; `syncAllCharityRevenue` passes a memoised
 * one so multiple orgs with the same charity start date share a single walk.
 */
export async function syncCharityRevenue(
	args: { organizationId: string },
	deps: { sum?: SumFn } = {},
): Promise<SyncCharityRevenueResult> {
	const sum = deps.sum ?? sumPaidSubscriptionRevenueCents;
	const config = await getCurrentCharityConfig({ organizationId: args.organizationId });
	if (!config) return { ok: false, reason: "no_current_charity" };
	try {
		const stripeRevenueCents = await sum({ since: config.startDate });
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

	// D37 single-club assumption: sumPaidSubscriptionRevenueCents walks the whole Stripe
	// account (it isn't scoped to an org), so it's only correct to call once per distinct
	// `since`. Today there's exactly one org; this memoisation keeps a future multi-org
	// cron run from re-walking Stripe once per org that happens to share a start date.
	const cache = new Map<number, Promise<number>>();
	const memoizedSum: SumFn = (sumArgs) => {
		const key = sumArgs.since.getTime();
		let cached = cache.get(key);
		if (!cached) {
			cached = sumPaidSubscriptionRevenueCents(sumArgs);
			cache.set(key, cached);
		}
		return cached;
	};

	let synced = 0;
	let failed = 0;
	for (const organizationId of orgIds) {
		const result = await syncCharityRevenue({ organizationId }, { sum: memoizedSum });
		if (result.ok) synced += 1;
		else failed += 1;
	}
	return { orgs: orgIds.length, synced, failed };
}
