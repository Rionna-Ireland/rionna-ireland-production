import { describe, expect, it } from "vitest";

import { computeGoalProgress, computeTotalCents, toCharityView } from "../charity-view";

describe("computeTotalCents", () => {
	it("applies the percentage to cached Stripe revenue, flooring to whole cents", () => {
		expect(computeTotalCents({ stripeRevenueCents: 123_456, percentage: 5, manualOverrideCents: null })).toBe(6_172);
	});
	it("uses the manual override when set, even if zero", () => {
		expect(computeTotalCents({ stripeRevenueCents: 123_456, percentage: 5, manualOverrideCents: 0 })).toBe(0);
		expect(computeTotalCents({ stripeRevenueCents: 123_456, percentage: 5, manualOverrideCents: 2_450_000 })).toBe(2_450_000);
	});
	it("is zero with no revenue", () => {
		expect(computeTotalCents({ stripeRevenueCents: 0, percentage: 5, manualOverrideCents: null })).toBe(0);
	});
	it("handles fractional percentages", () => {
		expect(computeTotalCents({ stripeRevenueCents: 100_000, percentage: 2.5, manualOverrideCents: null })).toBe(2_500);
	});
});

describe("computeGoalProgress", () => {
	it("returns null without a goal", () => {
		expect(computeGoalProgress(1_000, null)).toBeNull();
	});
	it("caps at 1", () => {
		expect(computeGoalProgress(5_000, 4_000)).toBe(1);
	});
	it("returns the ratio otherwise", () => {
		expect(computeGoalProgress(2_450_000, 3_600_000)).toBeCloseTo(0.6805, 3);
	});
	it("treats a zero goal as no goal", () => {
		expect(computeGoalProgress(1_000, 0)).toBeNull();
	});
});

describe("toCharityView", () => {
	const config = {
		charityName: "Irish Injured Jockeys",
		description: "Supporting jockeys after injury.",
		logoUrl: null,
		websiteUrl: "https://example.org",
		percentage: 5,
		goalCents: 3_600_000,
		manualOverrideCents: null,
		stripeRevenueCents: 49_000_000,
		currency: "EUR",
	};
	it("maps the row plus stories and poll id into the member view", () => {
		const view = toCharityView({ config, stories: [], pollId: null });
		expect(view).toEqual({
			charityName: "Irish Injured Jockeys",
			description: "Supporting jockeys after injury.",
			logoUrl: null,
			websiteUrl: "https://example.org",
			percentage: 5,
			totalCents: 2_450_000,
			goalCents: 3_600_000,
			goalProgress: 2_450_000 / 3_600_000,
			currency: "EUR",
			stories: [],
			pollId: null,
		});
	});
	it("accepts a Prisma Decimal-like percentage", () => {
		const view = toCharityView({ config: { ...config, percentage: { toNumber: () => 2.5 } }, stories: [], pollId: null });
		expect(view.percentage).toBe(2.5);
		expect(view.totalCents).toBe(1_225_000);
	});
});
