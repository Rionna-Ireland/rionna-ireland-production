/**
 * create-checkout-link guards:
 * - S12-09 / D39: while public signup is closed, only admins, users with a
 *   Member row in the club, or users with a pending invitation may check out.
 * - S12-10 A3: always require an acceptance of the current terms.
 * - D29: still refuses a user who is a member of another club.
 */

import { call } from "@orpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockMemberFindFirst,
	mockLegalFindFirst,
	mockGetOrganizationById,
	mockHasPendingInvitation,
	mockCreateCheckoutLinkFn,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockLegalFindFirst: vi.fn(),
	mockGetOrganizationById: vi.fn(),
	mockHasPendingInvitation: vi.fn(),
	mockCreateCheckoutLinkFn: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/auth/lib/signup-guard", () => ({
	hasPendingInvitation: mockHasPendingInvitation,
}));

vi.mock("@repo/database", () => ({
	db: {
		member: { findFirst: mockMemberFindFirst },
		legalAcceptance: { findFirst: mockLegalFindFirst },
	},
	getOrganizationById: mockGetOrganizationById,
}));

vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

vi.mock("@repo/payments", () => ({
	createCheckoutLink: mockCreateCheckoutLinkFn,
	findPriceByPlanId: vi.fn(() => ({ amount: 10 })),
	getCustomerIdFromEntity: vi.fn(async () => null),
	getProviderPriceIdByPlanId: vi.fn(() => "price_1"),
}));

import { createCheckoutLink } from "../procedures/create-checkout-link";

const ORG_ID = "club";
const ctx = { context: { headers: new Headers() } };
const INPUT = {
	planId: "membership",
	type: "subscription" as const,
	interval: "month" as const,
	organizationId: ORG_ID,
};
const ORIGINAL = process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;

function asUser(role: string | null = null) {
	mockGetSession.mockResolvedValue({
		user: { id: "u1", email: "a@example.com", name: "A", role },
		session: { id: "s1", activeOrganizationId: null },
	});
}

/** `db.member.findFirst` serves both the D29 (other org) and the club lookups. */
function memberRows({ otherOrg = false, club = false }: { otherOrg?: boolean; club?: boolean }) {
	mockMemberFindFirst.mockImplementation(async ({ where }) => {
		if (where.organizationId && typeof where.organizationId === "object") {
			return otherOrg ? { id: "m-other", organizationId: "other" } : null;
		}
		return club ? { id: "m-club" } : null;
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	delete process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
	asUser();
	memberRows({});
	mockHasPendingInvitation.mockResolvedValue(false);
	mockLegalFindFirst.mockResolvedValue({ id: "la1" });
	mockGetOrganizationById.mockResolvedValue({ id: ORG_ID, members: [] });
	mockCreateCheckoutLinkFn.mockResolvedValue("https://checkout.example/1");
});

afterEach(() => {
	if (ORIGINAL === undefined) {
		delete process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
	} else {
		process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN = ORIGINAL;
	}
});

describe("createCheckoutLink — signup closed (D39)", () => {
	it("refuses a role-less user with no membership or invitation", async () => {
		await expect(call(createCheckoutLink, INPUT, ctx)).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
		expect(mockCreateCheckoutLinkFn).not.toHaveBeenCalled();
	});

	it("allows a user with a Member row in the club", async () => {
		memberRows({ club: true });

		await expect(call(createCheckoutLink, INPUT, ctx)).resolves.toEqual({
			checkoutLink: "https://checkout.example/1",
		});
	});

	it("allows a user with a pending invitation", async () => {
		mockHasPendingInvitation.mockResolvedValue(true);

		await expect(call(createCheckoutLink, INPUT, ctx)).resolves.toBeDefined();
		expect(mockHasPendingInvitation).toHaveBeenCalledWith("a@example.com");
	});

	it("allows club admins", async () => {
		asUser("admin");

		await expect(call(createCheckoutLink, INPUT, ctx)).resolves.toBeDefined();
	});
});

describe("createCheckoutLink — signup open", () => {
	beforeEach(() => {
		process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN = "true";
	});

	it("allows a role-less user who accepted the terms", async () => {
		await expect(call(createCheckoutLink, INPUT, ctx)).resolves.toBeDefined();
		expect(mockHasPendingInvitation).not.toHaveBeenCalled();
	});

	it("refuses a user who has not accepted the current terms", async () => {
		mockLegalFindFirst.mockResolvedValue(null);

		await expect(call(createCheckoutLink, INPUT, ctx)).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
		expect(mockCreateCheckoutLinkFn).not.toHaveBeenCalled();
	});

	it("checks the current terms version for the org being checked out", async () => {
		await call(createCheckoutLink, INPUT, ctx);

		expect(mockLegalFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					userId: "u1",
					document: "terms",
					organizationId: ORG_ID,
				}),
			}),
		);
	});

	it("keeps the D29 other-club conflict", async () => {
		memberRows({ otherOrg: true });

		await expect(call(createCheckoutLink, INPUT, ctx)).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});
});

describe("createCheckoutLink — terms are required even for invitees while closed", () => {
	it("refuses an invited user without an acceptance", async () => {
		memberRows({ club: true });
		mockLegalFindFirst.mockResolvedValue(null);

		await expect(call(createCheckoutLink, INPUT, ctx)).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
	});
});
