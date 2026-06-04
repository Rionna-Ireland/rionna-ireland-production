/**
 * S2-08 v1: pure data helper for the subscription summary.
 *
 * Kept in a separate module from the oRPC procedure so unit tests can
 * exercise the helper without dragging the full middleware stack (auth,
 * mail, notifications) through dependency resolution.
 */

export interface SubscriptionSummary {
	purchaseId: string;
	status: string;
	planName: string;
	amount: number | null;
	currency: string;
	interval: string | null;
	currentPeriodEnd: Date | null;
	accessEndsAt: Date | null;
	cancelAtPeriodEnd: boolean;
	memberSince: Date;
}

const HEALTHY_STATUSES = new Set(["active", "trialing"]);

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SummaryDeps {
	db: {
		purchase: {
			findFirst: (args: any) => Promise<{
				id: string;
				subscriptionId: string | null;
				createdAt: Date;
			} | null>;
		};
	};
	getStripeClient: () => any;
	logger: { error: (msg: string, err: unknown) => void };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function loadSubscriptionSummary(
	userId: string,
	deps: SummaryDeps,
): Promise<SubscriptionSummary | null> {
	const purchase = await deps.db.purchase.findFirst({
		where: { userId, type: "SUBSCRIPTION" },
		orderBy: { createdAt: "desc" },
	});

	if (!purchase?.subscriptionId) return null;

	const subscriptionId = purchase.subscriptionId;
	const stripe = deps.getStripeClient();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let sub: any;
	try {
		sub = await stripe.subscriptions.retrieve(subscriptionId, {
			expand: ["items.data.price.product"],
		});
	} catch (e) {
		deps.logger.error("Failed to retrieve Stripe subscription for summary", e);
		return null;
	}

	const item = sub.items?.data?.[0];
	const price = item?.price;
	const product = price?.product as { name?: string } | undefined;
	const periodEndRaw: number | null = item?.current_period_end ?? sub?.current_period_end ?? null;
	const cancelAtRaw = typeof sub.cancel_at === "number" ? sub.cancel_at : null;
	const cancelAtPeriodEnd =
		sub.cancel_at_period_end === true ||
		(cancelAtRaw !== null &&
			cancelAtRaw > Math.floor(Date.now() / 1000) &&
			HEALTHY_STATUSES.has(sub.status));
	const accessEndsAtRaw = cancelAtPeriodEnd ? (cancelAtRaw ?? periodEndRaw) : null;

	const summary: SubscriptionSummary = {
		purchaseId: purchase.id,
		status: sub.status,
		planName: product?.name ?? "Membership",
		amount: price?.unit_amount ?? null,
		currency: price?.currency ?? "eur",
		interval: price?.recurring?.interval ?? null,
		currentPeriodEnd: periodEndRaw ? new Date(periodEndRaw * 1000) : null,
		accessEndsAt: accessEndsAtRaw ? new Date(accessEndsAtRaw * 1000) : null,
		cancelAtPeriodEnd,
		memberSince: purchase.createdAt,
	};

	return summary;
}
