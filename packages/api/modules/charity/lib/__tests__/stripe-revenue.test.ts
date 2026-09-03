import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoicesList } = vi.hoisted(() => ({ mockInvoicesList: vi.fn() }));

vi.mock("@repo/payments", () => ({
	getStripeClient: () => ({ invoices: { list: mockInvoicesList } }),
}));

import { sumPaidSubscriptionInvoices, sumPaidSubscriptionRevenueCents } from "../stripe-revenue";

const subscriptionInvoice = (overrides: Partial<{ amount_paid: number; status: string | null; subscription: string | null }> = {}) => ({
	amount_paid: overrides.amount_paid ?? 2900,
	status: overrides.status ?? "paid",
	parent:
		overrides.subscription === null
			? { type: "manual" as const, subscription_details: null }
			: { type: "subscription_details" as const, subscription_details: { subscription: overrides.subscription ?? "sub_1" } },
});

describe("sumPaidSubscriptionInvoices", () => {
	it("sums amount_paid for paid subscription invoices only", () => {
		const total = sumPaidSubscriptionInvoices([
			subscriptionInvoice({ amount_paid: 2900, subscription: "sub_1", status: "paid" }),
			subscriptionInvoice({ amount_paid: 2900, subscription: null, status: "paid" }), // one-off charge: excluded
			subscriptionInvoice({ amount_paid: 2900, subscription: "sub_2", status: "open" }), // unpaid: excluded
			subscriptionInvoice({ amount_paid: 0, subscription: "sub_3", status: "paid" }), // trial/zero: contributes 0
		]);
		expect(total).toBe(2900);
	});
	it("excludes an invoice with no parent at all (one-off charge)", () => {
		const total = sumPaidSubscriptionInvoices([{ amount_paid: 2900, status: "paid", parent: null }]);
		expect(total).toBe(0);
	});
	it("is zero for an empty list", () => {
		expect(sumPaidSubscriptionInvoices([])).toBe(0);
	});
});

describe("sumPaidSubscriptionRevenueCents", () => {
	beforeEach(() => vi.clearAllMocks());

	it("queries paid invoices since the start date and auto-paginates", async () => {
		mockInvoicesList
			.mockResolvedValueOnce({
				data: [{ id: "in_1", ...subscriptionInvoice({ amount_paid: 2900, subscription: "sub_1" }) }],
				has_more: true,
			})
			.mockResolvedValueOnce({
				data: [{ id: "in_2", ...subscriptionInvoice({ amount_paid: 2900, subscription: "sub_2" }) }],
				has_more: false,
			});
		const since = new Date("2026-03-01T00:00:00Z");
		const total = await sumPaidSubscriptionRevenueCents({ since });
		expect(total).toBe(5800);
		expect(mockInvoicesList).toHaveBeenCalledTimes(2);
		expect(mockInvoicesList).toHaveBeenNthCalledWith(1, {
			status: "paid",
			created: { gte: Math.floor(since.getTime() / 1000) },
			limit: 100,
		});
		expect(mockInvoicesList).toHaveBeenNthCalledWith(2, expect.objectContaining({ starting_after: "in_1" }));
	});

	it("does not paginate further when the first page says has_more: false", async () => {
		mockInvoicesList.mockResolvedValueOnce({
			data: [{ id: "in_1", ...subscriptionInvoice({ amount_paid: 2900, subscription: "sub_1" }) }],
			has_more: false,
		});
		const since = new Date("2026-03-01T00:00:00Z");
		const total = await sumPaidSubscriptionRevenueCents({ since });
		expect(total).toBe(2900);
		expect(mockInvoicesList).toHaveBeenCalledTimes(1);
	});
});
