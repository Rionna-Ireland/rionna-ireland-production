import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoicesList } = vi.hoisted(() => ({ mockInvoicesList: vi.fn() }));

vi.mock("@repo/payments", () => ({
	getStripeClient: () => ({ invoices: { list: mockInvoicesList } }),
}));

import { sumPaidSubscriptionInvoices, sumPaidSubscriptionRevenueCents } from "../stripe-revenue";

describe("sumPaidSubscriptionInvoices", () => {
	it("sums amount_paid for paid subscription invoices only", () => {
		const total = sumPaidSubscriptionInvoices([
			{ amount_paid: 2900, subscription: "sub_1", status: "paid" },
			{ amount_paid: 2900, subscription: null, status: "paid" }, // one-off charge: excluded
			{ amount_paid: 2900, subscription: "sub_2", status: "open" }, // unpaid: excluded
			{ amount_paid: 0, subscription: "sub_3", status: "paid" }, // trial/zero: contributes 0
		]);
		expect(total).toBe(2900);
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
				data: [{ id: "in_1", amount_paid: 2900, subscription: "sub_1", status: "paid" }],
				has_more: true,
			})
			.mockResolvedValueOnce({
				data: [{ id: "in_2", amount_paid: 2900, subscription: "sub_2", status: "paid" }],
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
});
