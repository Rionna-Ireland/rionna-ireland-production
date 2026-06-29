/**
 * S5-07 item 1: org-wide purchase over-exposure.
 *
 * Verifies getVisiblePurchases (from ../procedures/list-purchases):
 * - An owner/admin caller with an organizationId sees org-wide purchases.
 * - A plain `member` caller with an organizationId sees ONLY their own
 *   purchases (not the whole club's billing/subscription rows).
 * - With no organizationId the result stays user-scoped (paywall path).
 * - With no membership the result falls back to the user's own purchases.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ──────────────────────────────────────────────
// Mocks — vi.mock calls are hoisted, so use vi.hoisted
// ──────────────────────────────────────────────

const {
	mockGetOrganizationMembership,
	mockGetPurchasesByOrganizationId,
	mockGetPurchasesByUserId,
} = vi.hoisted(() => ({
	mockGetOrganizationMembership: vi.fn(),
	mockGetPurchasesByOrganizationId: vi.fn(),
	mockGetPurchasesByUserId: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	getOrganizationMembership: mockGetOrganizationMembership,
	getPurchasesByOrganizationId: mockGetPurchasesByOrganizationId,
	getPurchasesByUserId: mockGetPurchasesByUserId,
}));

// Stub @repo/payments and @repo/auth so importing list-purchases.ts (which
// pulls in the oRPC procedure + auth + mail provider) doesn't transitively
// load Resend, which throws at module load without an API key.
vi.mock("@repo/payments", () => ({
	getPlanIdByProviderPriceId: vi.fn(),
	getPlanPriceByProviderPriceId: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: vi.fn() } },
}));

// ──────────────────────────────────────────────
// Import the function under test
// ──────────────────────────────────────────────

import { getVisiblePurchases } from "../procedures/list-purchases";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const ORG_ID = "org-rionna";
const USER_ID = "u1";
const ORG_PURCHASES = [{ id: "p-org" }];
const USER_PURCHASES = [{ id: "p-user" }];

describe("getVisiblePurchases — org-wide gating (S5-07)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetPurchasesByOrganizationId.mockResolvedValue(ORG_PURCHASES);
		mockGetPurchasesByUserId.mockResolvedValue(USER_PURCHASES);
	});

	it("returns org-wide purchases for an owner caller with organizationId", async () => {
		mockGetOrganizationMembership.mockResolvedValue({
			role: "owner",
			organizationId: ORG_ID,
			userId: USER_ID,
		});

		const result = await getVisiblePurchases({
			organizationId: ORG_ID,
			userId: USER_ID,
		});

		expect(mockGetPurchasesByOrganizationId).toHaveBeenCalledWith(ORG_ID);
		expect(mockGetPurchasesByUserId).not.toHaveBeenCalled();
		expect(result).toBe(ORG_PURCHASES);
	});

	it("returns org-wide purchases for an admin caller with organizationId", async () => {
		mockGetOrganizationMembership.mockResolvedValue({
			role: "admin",
			organizationId: ORG_ID,
			userId: USER_ID,
		});

		const result = await getVisiblePurchases({
			organizationId: ORG_ID,
			userId: USER_ID,
		});

		expect(mockGetPurchasesByOrganizationId).toHaveBeenCalledWith(ORG_ID);
		expect(mockGetPurchasesByUserId).not.toHaveBeenCalled();
		expect(result).toBe(ORG_PURCHASES);
	});

	it("returns OWN purchases for a plain member caller with organizationId", async () => {
		mockGetOrganizationMembership.mockResolvedValue({
			role: "member",
			organizationId: ORG_ID,
			userId: USER_ID,
		});

		const result = await getVisiblePurchases({
			organizationId: ORG_ID,
			userId: USER_ID,
		});

		expect(mockGetPurchasesByOrganizationId).not.toHaveBeenCalled();
		expect(mockGetPurchasesByUserId).toHaveBeenCalledWith(USER_ID);
		expect(result).toBe(USER_PURCHASES);
	});

	it("returns OWN purchases when no organizationId is provided", async () => {
		const result = await getVisiblePurchases({ userId: USER_ID });

		expect(mockGetOrganizationMembership).not.toHaveBeenCalled();
		expect(mockGetPurchasesByOrganizationId).not.toHaveBeenCalled();
		expect(mockGetPurchasesByUserId).toHaveBeenCalledWith(USER_ID);
		expect(result).toBe(USER_PURCHASES);
	});

	it("returns OWN purchases when the caller has no membership", async () => {
		mockGetOrganizationMembership.mockResolvedValue(null);

		const result = await getVisiblePurchases({
			organizationId: ORG_ID,
			userId: USER_ID,
		});

		expect(mockGetPurchasesByOrganizationId).not.toHaveBeenCalled();
		expect(mockGetPurchasesByUserId).toHaveBeenCalledWith(USER_ID);
		expect(result).toBe(USER_PURCHASES);
	});
});
