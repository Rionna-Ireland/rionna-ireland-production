import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrent, mockListOrgIds, mockSetRevenue, mockSum, mockLoggerError } = vi.hoisted(() => ({
	mockGetCurrent: vi.fn(), mockListOrgIds: vi.fn(), mockSetRevenue: vi.fn(), mockSum: vi.fn(), mockLoggerError: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	getCurrentCharityConfig: mockGetCurrent,
	listOrgIdsWithCurrentCharity: mockListOrgIds,
	setCharityRevenue: mockSetRevenue,
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: mockLoggerError, log: vi.fn() } }));
vi.mock("../stripe-revenue", () => ({ sumPaidSubscriptionRevenueCents: mockSum }));

import { syncAllCharityRevenue, syncCharityRevenue } from "../sync-charity-revenue";

const CONFIG = { id: "c1", organizationId: "org1", startDate: new Date("2026-03-01T00:00:00Z") };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetCurrent.mockResolvedValue(CONFIG);
	mockSum.mockResolvedValue(490_000);
	mockSetRevenue.mockResolvedValue(undefined);
});

describe("syncCharityRevenue", () => {
	it("sums since startDate and caches the figure on the current config", async () => {
		const result = await syncCharityRevenue({ organizationId: "org1" });
		expect(mockSum).toHaveBeenCalledWith({ since: CONFIG.startDate });
		expect(mockSetRevenue).toHaveBeenCalledWith(expect.objectContaining({ configId: "c1", stripeRevenueCents: 490_000 }));
		expect(result).toMatchObject({ ok: true, configId: "c1", stripeRevenueCents: 490_000 });
	});
	it("reports no_current_charity without calling Stripe", async () => {
		mockGetCurrent.mockResolvedValue(null);
		expect(await syncCharityRevenue({ organizationId: "org1" })).toEqual({ ok: false, reason: "no_current_charity" });
		expect(mockSum).not.toHaveBeenCalled();
	});
	it("swallows Stripe errors, logs, and leaves the cached figure untouched", async () => {
		mockSum.mockRejectedValue(new Error("rate limited"));
		expect(await syncCharityRevenue({ organizationId: "org1" })).toEqual({ ok: false, reason: "stripe_error" });
		expect(mockSetRevenue).not.toHaveBeenCalled();
		expect(mockLoggerError).toHaveBeenCalled();
	});
});

describe("syncAllCharityRevenue", () => {
	it("walks every org with a current charity and counts outcomes", async () => {
		mockListOrgIds.mockResolvedValue(["org1", "org2"]);
		mockGetCurrent
			.mockResolvedValueOnce(CONFIG)
			.mockResolvedValueOnce({ ...CONFIG, id: "c2", organizationId: "org2", startDate: new Date("2026-04-01T00:00:00Z") });
		mockSum.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("boom"));
		expect(await syncAllCharityRevenue()).toEqual({ orgs: 2, synced: 1, failed: 1 });
	});

	// D37 single-club assumption: sumPaidSubscriptionRevenueCents walks the whole Stripe
	// account (it isn't scoped per org), so two orgs whose current charity started on the
	// same date would otherwise redo the exact same Stripe pagination twice per cron run.
	it("memoises the Stripe walk per since date: two orgs with the same startDate share one walk", async () => {
		mockListOrgIds.mockResolvedValue(["org1", "org2"]);
		mockGetCurrent
			.mockResolvedValueOnce(CONFIG)
			.mockResolvedValueOnce({ ...CONFIG, id: "c2", organizationId: "org2" }); // same startDate as CONFIG
		mockSum.mockResolvedValue(490_000);
		expect(await syncAllCharityRevenue()).toEqual({ orgs: 2, synced: 2, failed: 0 });
		expect(mockSum).toHaveBeenCalledTimes(1);
		expect(mockSum).toHaveBeenCalledWith({ since: CONFIG.startDate });
		expect(mockSetRevenue).toHaveBeenCalledWith(expect.objectContaining({ configId: "c1", stripeRevenueCents: 490_000 }));
		expect(mockSetRevenue).toHaveBeenCalledWith(expect.objectContaining({ configId: "c2", stripeRevenueCents: 490_000 }));
	});
});
