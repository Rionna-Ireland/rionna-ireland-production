import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectSpy, mockGetOrganizationList, mockListPurchases } = vi.hoisted(() => ({
	redirectSpy: vi.fn((url: string) => {
		throw new Error(`REDIRECT:${url}`);
	}),
	mockGetOrganizationList: vi.fn(),
	mockListPurchases: vi.fn(),
}));

vi.mock("@auth/lib/server", () => ({
	getSession: vi.fn(async () => ({ user: { id: "u1", email: "a@example.com", role: null } })),
	getOrganizationList: mockGetOrganizationList,
}));
vi.mock("@auth/lib/terms-gate", () => ({ requireTermsAccepted: vi.fn() }));
vi.mock("@repo/api/modules/payments/lib/checkout-eligibility", () => ({
	canCheckoutBeforeLaunch: vi.fn(async () => true),
}));
vi.mock("@payments/lib/server", () => ({ listPurchases: mockListPurchases }));
vi.mock("@repo/payments/lib/helper", () => ({
	createPurchasesHelper: (purchases: unknown[]) => ({ activePlan: purchases.length ? "membership" : null }),
}));
vi.mock("@repo/database", () => ({ db: {} }));
vi.mock("@repo/payments/config", () => ({ config: { plans: {} } }));
vi.mock("@auth/components/MembershipsClosedNotice", () => ({ MembershipsClosedNotice: () => null }));
vi.mock("@shared/components/AuthWrapper", () => ({
	AuthWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./SubscribeButton", () => ({ SubscribeButton: () => null }));
vi.mock("next/navigation", () => ({ redirect: redirectSpy }));
vi.mock("next-intl/server", () => ({
	getTranslations: vi.fn(async () => (key: string) => key),
}));

import SubscribePage from "./page";

beforeEach(() => {
	vi.clearAllMocks();
	mockListPurchases.mockResolvedValue([{ id: "p1" }]);
});

describe("SubscribePage with an active plan", () => {
	it("redirects to the app when the user has a club membership", async () => {
		mockGetOrganizationList.mockResolvedValue([{ id: "org1" }]);

		await expect(SubscribePage()).rejects.toThrow("REDIRECT:/");
	});

	it("shows the pending notice instead of redirecting when there is no Member row", async () => {
		mockGetOrganizationList.mockResolvedValue([]);

		const page = await SubscribePage();

		expect(redirectSpy).not.toHaveBeenCalled();
		expect(JSON.stringify(page)).toContain("membershipPending");
	});
});
