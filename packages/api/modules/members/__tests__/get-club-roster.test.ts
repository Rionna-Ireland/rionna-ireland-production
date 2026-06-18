/**
 * getClubRoster tests (S2-09 surface G)
 *
 * The unified roster no single dashboard provides: one row per member =
 * identity (Better-Auth) + subscription status (Stripe) + community status
 * (Circle). Subscription status is derived from the member's purchases by
 * priority (active > trialing > past_due > canceled > none).
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindMany, mockPurchaseFindMany } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindMany: vi.fn(),
	mockPurchaseFindMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: {
		member: { findMany: mockMemberFindMany },
		purchase: { findMany: mockPurchaseFindMany },
	},
}));

import { getClubRoster } from "../procedures/get-club-roster";

const ADMIN = { id: "admin", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockMemberFindMany.mockResolvedValue([
		{
			id: "m1",
			userId: "u1",
			role: "member",
			createdAt: new Date("2026-01-01"),
			circleStatus: "active",
			circleMemberId: "c1",
			user: { id: "u1", name: "Alice", email: "alice@test.com", role: null },
		},
		{
			id: "m2",
			userId: "u2",
			role: "member",
			createdAt: new Date("2026-02-01"),
			circleStatus: "provisioning_failed",
			circleMemberId: null,
			user: { id: "u2", name: "Bob", email: "bob@test.com", role: null },
		},
	]);
	mockPurchaseFindMany.mockResolvedValue([
		{ userId: "u1", status: "active" },
		{ userId: "u2", status: "canceled" },
		{ userId: "u2", status: "past_due" },
	]);
});

describe("getClubRoster (S2-09 surface G)", () => {
	it("joins identity + subscription + circle status per member", async () => {
		const result = await call(getClubRoster, { organizationId: "org1" }, ctx);

		expect(result).toEqual([
			{
				memberId: "m1",
				userId: "u1",
				name: "Alice",
				email: "alice@test.com",
				memberRole: "member",
				subscriptionStatus: "active",
				circleStatus: "active",
				circleMemberId: "c1",
				joinedAt: new Date("2026-01-01"),
			},
			{
				memberId: "m2",
				userId: "u2",
				name: "Bob",
				email: "bob@test.com",
				memberRole: "member",
				// past_due outranks canceled
				subscriptionStatus: "past_due",
				circleStatus: "provisioning_failed",
				circleMemberId: null,
				joinedAt: new Date("2026-02-01"),
			},
		]);
	});

	it("reports 'none' when a member has no purchases", async () => {
		mockMemberFindMany.mockResolvedValue([
			{
				id: "m3",
				userId: "u3",
				role: "member",
				createdAt: new Date("2026-03-01"),
				circleStatus: null,
				circleMemberId: null,
				user: { id: "u3", name: "Cara", email: "cara@test.com", role: null },
			},
		]);
		mockPurchaseFindMany.mockResolvedValue([]);

		const result = await call(getClubRoster, { organizationId: "org1" }, ctx);

		expect(result[0]?.subscriptionStatus).toBe("none");
	});
});
