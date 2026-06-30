/**
 * S2-10: Guided member removal orchestration.
 *
 * Verifies removeMember (from packages/api/modules/members/lib/remove-member):
 * cancel Stripe → deactivate Circle inline → hard-delete the Member row, in that
 * order, returning a per-system { stripe, circle, app } summary. Guards reject
 * self-removal and removing the last owner/admin. Partial failures abort before
 * the irreversible delete and are surfaced, never thrown.
 *
 * @see Architecture/specs/S2-10-guided-member-removal.md
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ──────────────────────────────────────────────
// Mocks — vi.mock is hoisted, so declare fns via vi.hoisted
// ──────────────────────────────────────────────

const {
	mockMemberFindUnique,
	mockMemberCount,
	mockMemberDelete,
	mockPurchaseFindFirst,
	mockCancelSubscription,
	mockDeactivateCircleMember,
	mockLoggerInfo,
	mockLoggerWarn,
	mockLoggerError,
} = vi.hoisted(() => ({
	mockMemberFindUnique: vi.fn(),
	mockMemberCount: vi.fn(),
	mockMemberDelete: vi.fn(),
	mockPurchaseFindFirst: vi.fn(),
	mockCancelSubscription: vi.fn(),
	mockDeactivateCircleMember: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
	mockLoggerError: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		member: {
			findUnique: mockMemberFindUnique,
			count: mockMemberCount,
			delete: mockMemberDelete,
		},
		purchase: { findFirst: mockPurchaseFindFirst },
	},
}));

vi.mock("@repo/logs", () => ({
	logger: {
		info: mockLoggerInfo,
		warn: mockLoggerWarn,
		error: mockLoggerError,
		log: vi.fn(),
	},
}));

vi.mock("@repo/payments/provider/stripe", () => ({
	cancelSubscription: mockCancelSubscription,
}));

vi.mock("@repo/payments/lib/circle-provisioning", () => ({
	deactivateCircleMember: mockDeactivateCircleMember,
}));

// ──────────────────────────────────────────────
// Import under test
// ──────────────────────────────────────────────

import { removeMember } from "../lib/remove-member";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const ORG_ID = "org-rionna";
const ACTOR_ID = "admin-user";

// A plain member with an active sub + active Circle space.
const MEMBER = {
	id: "m1",
	userId: "u1",
	organizationId: ORG_ID,
	role: "member",
	circleMemberId: "circle-1",
	circleStatus: "active",
};

const ACTIVE_PURCHASE = {
	id: "p1",
	subscriptionId: "sub_123",
	status: "active",
};

function input(overrides: Partial<Parameters<typeof removeMember>[0]> = {}) {
	return {
		memberId: "m1",
		organizationId: ORG_ID,
		actorUserId: ACTOR_ID,
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockMemberFindUnique.mockResolvedValue(MEMBER);
	mockMemberCount.mockResolvedValue(2);
	mockMemberDelete.mockResolvedValue({});
	mockPurchaseFindFirst.mockResolvedValue(ACTIVE_PURCHASE);
	mockCancelSubscription.mockResolvedValue(undefined);
	mockDeactivateCircleMember.mockResolvedValue(true);
});

describe("removeMember — guards", () => {
	it("rejects self-removal (an admin cannot remove their own membership)", async () => {
		mockMemberFindUnique.mockResolvedValue({ ...MEMBER, userId: ACTOR_ID });

		await expect(removeMember(input())).rejects.toMatchObject({
			code: "self_removal",
		});
		expect(mockMemberDelete).not.toHaveBeenCalled();
		expect(mockCancelSubscription).not.toHaveBeenCalled();
	});

	it("rejects when the member is not found in this organization", async () => {
		mockMemberFindUnique.mockResolvedValue(null);

		await expect(removeMember(input())).rejects.toMatchObject({
			code: "member_not_found",
		});
	});

	it("rejects removing a member belonging to a different organization", async () => {
		mockMemberFindUnique.mockResolvedValue({
			...MEMBER,
			organizationId: "other-org",
		});

		await expect(removeMember(input())).rejects.toMatchObject({
			code: "member_not_found",
		});
	});

	it("rejects removing the last owner/admin of the organization", async () => {
		mockMemberFindUnique.mockResolvedValue({ ...MEMBER, role: "admin" });
		mockMemberCount.mockResolvedValue(1);

		await expect(removeMember(input())).rejects.toMatchObject({
			code: "last_admin",
		});
		expect(mockMemberDelete).not.toHaveBeenCalled();
		expect(mockCancelSubscription).not.toHaveBeenCalled();
	});

	it("allows removing an admin when another owner/admin remains", async () => {
		mockMemberFindUnique.mockResolvedValue({ ...MEMBER, role: "admin" });
		mockMemberCount.mockResolvedValue(2);

		await expect(removeMember(input())).resolves.toBeDefined();
	});
});

describe("removeMember — Stripe cancellation", () => {
	it("cancels the active subscription and reports stripe: ok", async () => {
		const result = await removeMember(input());

		expect(mockCancelSubscription).toHaveBeenCalledWith("sub_123");
		expect(result.stripe).toBe("ok");
	});

	it("skips Stripe when the member has no active subscription", async () => {
		mockPurchaseFindFirst.mockResolvedValue(null);

		const result = await removeMember(input());

		expect(mockCancelSubscription).not.toHaveBeenCalled();
		expect(result.stripe).toBe("skipped");
	});

	it("only considers active/trialing/past_due subscriptions with a subscriptionId", async () => {
		await removeMember(input());

		expect(mockPurchaseFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					organizationId: ORG_ID,
					userId: "u1",
					subscriptionId: { not: null },
					status: { in: ["active", "trialing", "past_due"] },
				}),
			}),
		);
	});
});

describe("removeMember — Circle deactivation + member delete", () => {
	it("deactivates the Circle space BEFORE deleting the Member row", async () => {
		const result = await removeMember(input());

		expect(mockDeactivateCircleMember).toHaveBeenCalledWith({
			id: "m1",
			circleMemberId: "circle-1",
		});
		expect(mockMemberDelete).toHaveBeenCalledWith({ where: { id: "m1" } });

		// Ordering invariant — the webhook resolves circleMemberId via the Member
		// row, so Circle must be deactivated while the row still exists.
		expect(
			mockDeactivateCircleMember.mock.invocationCallOrder[0],
		).toBeLessThan(mockMemberDelete.mock.invocationCallOrder[0]);

		expect(result.circle).toBe("ok");
		expect(result.app).toBe("ok");
	});

	it("skips Circle when the member has no Circle space", async () => {
		mockMemberFindUnique.mockResolvedValue({
			...MEMBER,
			circleMemberId: null,
		});

		const result = await removeMember(input());

		expect(mockDeactivateCircleMember).not.toHaveBeenCalled();
		expect(result.circle).toBe("skipped");
		expect(mockMemberDelete).toHaveBeenCalled();
		expect(result.app).toBe("ok");
	});

	it("skips Circle when the space is already deactivated", async () => {
		mockMemberFindUnique.mockResolvedValue({
			...MEMBER,
			circleStatus: "deactivated",
		});

		const result = await removeMember(input());

		expect(mockDeactivateCircleMember).not.toHaveBeenCalled();
		expect(result.circle).toBe("skipped");
		expect(result.app).toBe("ok");
	});

	it("returns an all-ok summary for a clean full removal", async () => {
		const result = await removeMember(input());

		expect(result).toEqual({ stripe: "ok", circle: "ok", app: "ok" });
	});
});

describe("removeMember — partial failure (resumable, never throws)", () => {
	it("aborts before touching Circle or the Member row when Stripe cancel fails", async () => {
		mockCancelSubscription.mockRejectedValue(new Error("stripe down"));

		const result = await removeMember(input());

		expect(result).toEqual({
			stripe: "failed",
			circle: "skipped",
			app: "skipped",
		});
		expect(mockDeactivateCircleMember).not.toHaveBeenCalled();
		expect(mockMemberDelete).not.toHaveBeenCalled();
	});

	it("aborts before deleting the Member row when Circle deactivation fails (so the webhook can still retry)", async () => {
		mockDeactivateCircleMember.mockResolvedValue(false);

		const result = await removeMember(input());

		expect(result).toEqual({
			stripe: "ok",
			circle: "failed",
			app: "skipped",
		});
		expect(mockMemberDelete).not.toHaveBeenCalled();
	});

	it("surfaces a delete failure without throwing (Stripe + Circle already done)", async () => {
		mockMemberDelete.mockRejectedValue(new Error("db unavailable"));

		const result = await removeMember(input());

		expect(result).toEqual({
			stripe: "ok",
			circle: "ok",
			app: "failed",
		});
	});
});

describe("removeMember — audit", () => {
	it("logs the removal with the actor, target, and per-system summary", async () => {
		await removeMember(input());

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			"Admin removed member from organization",
			expect.objectContaining({
				event: "admin_member_removed",
				actorUserId: ACTOR_ID,
				organizationId: ORG_ID,
				memberId: "m1",
				removedUserId: "u1",
				result: { stripe: "ok", circle: "ok", app: "ok" },
			}),
		);
	});
});
