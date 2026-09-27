import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectSpy, mockCanCheckout, mockRequireTerms } = vi.hoisted(() => ({
	redirectSpy: vi.fn((url: string) => {
		throw new Error(`REDIRECT:${url}`);
	}),
	mockCanCheckout: vi.fn(),
	mockRequireTerms: vi.fn(),
}));

vi.mock("@auth/lib/server", () => ({
	getSession: vi.fn(async () => ({ user: { id: "u1", email: "a@example.com", role: null } })),
	getOrganizationList: vi.fn(async () => []),
}));
vi.mock("@auth/lib/terms-gate", () => ({ requireTermsAccepted: mockRequireTerms }));
vi.mock("@repo/api/modules/payments/lib/checkout-eligibility", () => ({
	canCheckoutBeforeLaunch: mockCanCheckout,
}));
vi.mock("@payments/lib/server", () => ({ listPurchases: vi.fn(async () => []) }));
vi.mock("@payments/components/PricingTable", () => ({ PricingTable: () => "PRICING_TABLE" }));
vi.mock("@auth/components/MembershipsClosedNotice", () => ({
	MembershipsClosedNotice: () => "MEMBERSHIPS_CLOSED",
}));
vi.mock("@shared/components/AuthWrapper", () => ({
	AuthWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({ redirect: redirectSpy }));
vi.mock("next-intl/server", () => ({
	getTranslations: vi.fn(async () => (key: string) => key),
}));

import { MembershipsClosedNotice } from "@auth/components/MembershipsClosedNotice";

import ChoosePlanPage from "./page";

beforeEach(() => {
	vi.clearAllMocks();
	mockRequireTerms.mockResolvedValue(undefined);
});

describe("ChoosePlanPage (S12-09 / D39)", () => {
	it("shows the waitlist notice instead of plans while memberships are closed", async () => {
		mockCanCheckout.mockResolvedValue(false);

		const page = await ChoosePlanPage();

		expect(page.props.children.type).toBe(MembershipsClosedNotice);
		expect(page.props.contentClass).toBeUndefined();
		expect(mockRequireTerms).toHaveBeenCalledWith("/choose-plan");
		expect(mockCanCheckout).toHaveBeenCalledWith(
			expect.objectContaining({ id: "u1" }),
			undefined,
		);
	});

	it("shows plans when checkout is allowed", async () => {
		mockCanCheckout.mockResolvedValue(true);

		const page = await ChoosePlanPage();

		expect(page.props.contentClass).toBe("max-w-5xl");
	});
});
