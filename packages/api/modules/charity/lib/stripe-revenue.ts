import { getStripeClient } from "@repo/payments";

/** The three invoice fields the sum depends on (keeps tests free of the Stripe type). */
export interface InvoiceLike {
	amount_paid: number;
	subscription: unknown | null;
	status: string | null;
}

/**
 * Gross collected subscription revenue: `amount_paid` on paid invoices that belong
 * to a subscription. Refunds and Stripe fees are ignored by decision (S12-01 #2);
 * the admin override exists for the cases where that's wrong.
 */
export function sumPaidSubscriptionInvoices(invoices: InvoiceLike[]): number {
	let total = 0;
	for (const invoice of invoices) {
		if (invoice.status !== "paid" || !invoice.subscription) continue;
		total += invoice.amount_paid;
	}
	return total;
}

const PAGE_SIZE = 100;

/** Walks every paid invoice created on/after `since`. Single Stripe account = single club. */
export async function sumPaidSubscriptionRevenueCents(args: { since: Date }): Promise<number> {
	const stripe = getStripeClient();
	const created = { gte: Math.floor(args.since.getTime() / 1000) };
	let total = 0;
	let startingAfter: string | undefined;
	for (;;) {
		const page = await stripe.invoices.list({
			status: "paid",
			created,
			limit: PAGE_SIZE,
			...(startingAfter ? { starting_after: startingAfter } : {}),
		});
		total += sumPaidSubscriptionInvoices(page.data as unknown as InvoiceLike[]);
		if (!page.has_more || page.data.length === 0) break;
		startingAfter = page.data[page.data.length - 1].id;
	}
	return total;
}
