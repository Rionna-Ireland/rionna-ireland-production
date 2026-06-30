/**
 * getClubHealth tests (S2-09 surface A — Mission Control)
 *
 * Aggregates the club-health tiles: paying members, active subs, past-due
 * count, and Circle-provisioning failures (members + horse spaces combined).
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberCount, mockPurchaseCount, mockHorseCount } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberCount: vi.fn(),
	mockPurchaseCount: vi.fn(),
	mockHorseCount: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: {
		member: { count: mockMemberCount },
		purchase: { count: mockPurchaseCount },
		horse: { count: mockHorseCount },
	},
}));

import { getClubHealth } from "../procedures/get-club-health";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	// member.count is called for both paying members and provisioning failures
	mockMemberCount.mockImplementation((args: { where: { circleStatus?: string } }) =>
		Promise.resolve(args.where.circleStatus === "provisioning_failed" ? 2 : 34),
	);
	// purchase.count for active/trialing vs past_due
	mockPurchaseCount.mockImplementation((args: { where: { status: unknown } }) =>
		Promise.resolve(args.where.status === "past_due" ? 1 : 30),
	);
	// horse.count for failed space provisioning
	mockHorseCount.mockResolvedValue(1);
});

describe("getClubHealth (S2-09 surface A)", () => {
	it("returns the club-health tile counts", async () => {
		const result = await call(getClubHealth, { organizationId: "org1" }, ctx);

		expect(result).toEqual({
			memberCount: 34,
			activeSubscriptionCount: 30,
			pastDueCount: 1,
			// 2 members + 1 horse space failed
			circleProvisioningFailures: 3,
		});
	});

	it("counts paying members by role and failures by circleStatus", async () => {
		await call(getClubHealth, { organizationId: "org1" }, ctx);

		expect(mockMemberCount).toHaveBeenCalledWith({
			where: { organizationId: "org1", role: "member" },
		});
		expect(mockMemberCount).toHaveBeenCalledWith({
			where: { organizationId: "org1", circleStatus: "provisioning_failed" },
		});
		expect(mockHorseCount).toHaveBeenCalledWith({
			where: { organizationId: "org1", circleSpaceStatus: "provisioning_failed" },
		});
	});
});
