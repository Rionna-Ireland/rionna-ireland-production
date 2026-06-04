/**
 * S2-08 v1: unit tests for the subscription-summary helper.
 *
 * Covers:
 * - returns null when the user has no Purchase row with a subscriptionId
 * - maps Stripe subscription response onto the SubscriptionSummary shape
 * - refreshes Stripe state on each call so portal-side cancellation changes
 *   are visible immediately on the member dashboard
 *
 * Targets `loadSubscriptionSummary` directly (the pure data helper the
 * oRPC procedure delegates to) so the test doesn't need the full middleware
 * stack at import time.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadSubscriptionSummary } from "../procedures/get-subscription-summary.impl";

function makeDeps() {
	const mockFindFirst = vi.fn();
	const mockRetrieve = vi.fn();
	const mockLoggerError = vi.fn();
	const deps = {
		db: { purchase: { findFirst: mockFindFirst } },
		getStripeClient: () => ({
			subscriptions: { retrieve: mockRetrieve },
		}),
		logger: { error: mockLoggerError },
	};
	return { deps, mockFindFirst, mockRetrieve, mockLoggerError };
}

describe("loadSubscriptionSummary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns null when the user has no subscription purchase", async () => {
		const { deps, mockFindFirst, mockRetrieve } = makeDeps();
		mockFindFirst.mockResolvedValueOnce(null);

		const result = await loadSubscriptionSummary("user_1", deps);

		expect(result).toBeNull();
		expect(mockRetrieve).not.toHaveBeenCalled();
	});

	it("returns null when the purchase has no subscriptionId", async () => {
		const { deps, mockFindFirst, mockRetrieve } = makeDeps();
		mockFindFirst.mockResolvedValueOnce({
			id: "p_1",
			subscriptionId: null,
			createdAt: new Date("2026-01-01"),
		});

		const result = await loadSubscriptionSummary("user_1", deps);

		expect(result).toBeNull();
		expect(mockRetrieve).not.toHaveBeenCalled();
	});

	it("maps the Stripe subscription onto the summary shape", async () => {
		const { deps, mockFindFirst, mockRetrieve } = makeDeps();
		const createdAt = new Date("2026-03-12T00:00:00.000Z");
		mockFindFirst.mockResolvedValueOnce({
			id: "p_42",
			subscriptionId: "sub_42",
			createdAt,
		});
		mockRetrieve.mockResolvedValueOnce({
			id: "sub_42",
			status: "active",
			cancel_at_period_end: false,
			current_period_end: 1_750_000_000,
			items: {
				data: [
					{
						current_period_end: 1_750_000_000,
						price: {
							unit_amount: 2500,
							currency: "eur",
							recurring: { interval: "month" },
							product: { name: "Pink Connections Membership" },
						},
					},
				],
			},
		});

		const result = await loadSubscriptionSummary("user_42", deps);

		expect(result).toEqual({
			purchaseId: "p_42",
			status: "active",
			planName: "Pink Connections Membership",
			amount: 2500,
			currency: "eur",
			interval: "month",
			currentPeriodEnd: new Date(1_750_000_000 * 1000),
			accessEndsAt: null,
			cancelAtPeriodEnd: false,
			memberSince: createdAt,
		});
	});

	it("refreshes Stripe state on each call so scheduled cancellations show immediately", async () => {
		const { deps, mockFindFirst, mockRetrieve } = makeDeps();
		mockFindFirst.mockResolvedValue({
			id: "p_cache",
			subscriptionId: "sub_cache",
			createdAt: new Date("2026-01-01"),
		});
		mockRetrieve.mockResolvedValueOnce({
			id: "sub_cache",
			status: "active",
			cancel_at_period_end: false,
			current_period_end: 1_700_000_000,
			items: {
				data: [
					{
						current_period_end: 1_700_000_000,
						price: {
							unit_amount: 2500,
							currency: "eur",
							recurring: { interval: "month" },
							product: { name: "Pink Connections" },
						},
					},
				],
			},
		});
		mockRetrieve.mockResolvedValueOnce({
			id: "sub_cache",
			status: "active",
			cancel_at_period_end: true,
			current_period_end: 1_700_000_000,
			items: {
				data: [
					{
						current_period_end: 1_700_000_000,
						price: {
							unit_amount: 2500,
							currency: "eur",
							recurring: { interval: "month" },
							product: { name: "Pink Connections" },
						},
					},
				],
			},
		});

		const beforeCancel = await loadSubscriptionSummary("user_cache", deps);
		const afterCancel = await loadSubscriptionSummary("user_cache", deps);

		expect(beforeCancel?.cancelAtPeriodEnd).toBe(false);
		expect(afterCancel?.cancelAtPeriodEnd).toBe(true);
		expect(mockRetrieve).toHaveBeenCalledTimes(2);
	});

	it("treats a future Stripe cancel_at timestamp as scheduled cancellation", async () => {
		const { deps, mockFindFirst, mockRetrieve } = makeDeps();
		const createdAt = new Date("2026-01-01");
		mockFindFirst.mockResolvedValueOnce({
			id: "p_cancel_at",
			subscriptionId: "sub_cancel_at",
			createdAt,
		});
		mockRetrieve.mockResolvedValueOnce({
			id: "sub_cancel_at",
			status: "active",
			cancel_at_period_end: false,
			cancel_at: 1_900_000_000,
			current_period_end: 1_800_000_000,
			items: {
				data: [
					{
						current_period_end: 1_800_000_000,
						price: {
							unit_amount: 2500,
							currency: "eur",
							recurring: { interval: "month" },
							product: { name: "Pink Connections" },
						},
					},
				],
			},
		});

		const result = await loadSubscriptionSummary("user_cancel_at", deps);

		expect(result).toMatchObject({
			status: "active",
			currentPeriodEnd: new Date(1_800_000_000 * 1000),
			accessEndsAt: new Date(1_900_000_000 * 1000),
			cancelAtPeriodEnd: true,
			memberSince: createdAt,
		});
	});
});
