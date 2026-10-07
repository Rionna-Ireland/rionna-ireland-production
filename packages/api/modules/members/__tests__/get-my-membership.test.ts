/**
 * getMyMembership tests (S13-12) — GET /api/me/membership
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindFirst, mockPurchaseFindMany } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockPurchaseFindMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		member: { findFirst: mockMemberFindFirst },
		purchase: { findMany: mockPurchaseFindMany },
	},
}));

import { deriveMembershipStatus } from "../lib/membership-status";
import { getMyMembership } from "../procedures/get-my-membership";

const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({
		user: { id: "u1", role: null },
		session: { id: "s1", activeOrganizationId: "org1" },
	});
	mockMemberFindFirst.mockResolvedValue({
		organizationId: "org1",
		createdAt: new Date("2026-03-01T10:00:00.000Z"),
		foundingMember: true,
	});
	mockPurchaseFindMany.mockResolvedValue([{ status: "active" }]);
});

describe("getMyMembership", () => {
	it("returns since, foundingMember and status with no other dates", async () => {
		const result = await call(getMyMembership, undefined, ctx);
		expect(result).toEqual({
			since: "2026-03-01T10:00:00.000Z",
			foundingMember: true,
			status: "active",
		});
		expect(mockMemberFindFirst.mock.calls[0][0].where).toEqual({
			userId: "u1",
			organizationId: "org1",
		});
	});

	it("returns none when the user has no member row", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		expect(await call(getMyMembership, undefined, ctx)).toEqual({
			since: null,
			foundingMember: false,
			status: "none",
		});
	});

	it("rejects unauthenticated callers", async () => {
		mockGetSession.mockResolvedValue(null);
		await expect(call(getMyMembership, undefined, ctx)).rejects.toThrow();
	});
});

describe("deriveMembershipStatus", () => {
	it.each([
		[["active"], "active"],
		[["trialing"], "active"],
		[["canceled", "active"], "active"],
		[["past_due"], "past_due"],
		[["canceled", "past_due"], "past_due"],
		[["canceled"], "cancelled"],
		[["expired", "rejected_d29"], "cancelled"],
		[[], "none"],
	])("%j -> %s", (statuses, expected) => {
		expect(deriveMembershipStatus(statuses)).toBe(expected);
	});
});
