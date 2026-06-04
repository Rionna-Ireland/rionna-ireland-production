/**
 * S1-06: Circle/Stripe Reconciliation Tests
 *
 * Verifies the reconcileCircleMembers function:
 * - Unprovisioned members (active Purchase, no circleMemberId) get provisioned
 * - Stale active members (canceled Purchase, circleStatus active) get deactivated
 * - Per-member resilience — one failure doesn't block others
 * - Errors logged with structured context (userId, orgId)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ──────────────────────────────────────────────
// Mocks — vi.mock calls are hoisted
// ──────────────────────────────────────────────

const {
	mockOrgFindUnique,
	mockMemberFindManyUnprovisioned,
	mockMemberFindManyStale,
	mockMemberUpdate,
	mockCreateMember,
	mockDeactivateMember,
	mockLoggerInfo,
	mockLoggerWarn,
	mockLoggerError,
} = vi.hoisted(() => ({
	mockOrgFindUnique: vi.fn(),
	mockMemberFindManyUnprovisioned: vi.fn(),
	mockMemberFindManyStale: vi.fn(),
	mockMemberUpdate: vi.fn(),
	mockCreateMember: vi.fn(),
	mockDeactivateMember: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
	mockLoggerError: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: {
			findUnique: mockOrgFindUnique,
		},
		member: {
			findMany: vi.fn((args) => {
				// Route to the correct mock based on the query shape
				if (args.where?.circleMemberId === null) {
					return mockMemberFindManyUnprovisioned(args);
				}
				return mockMemberFindManyStale(args);
			}),
			update: mockMemberUpdate,
		},
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

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({
		createMember: mockCreateMember,
		deactivateMember: mockDeactivateMember,
		reactivateMember: vi.fn(),
		deleteMember: vi.fn(),
		getMemberToken: vi.fn(),
	})),
}));

// ──────────────────────────────────────────────
// Import the function under test
// ──────────────────────────────────────────────

import { reconcileCircleMembers } from "../reconciliation";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const ORG_ID = "org-rionna";
const ORG = { id: ORG_ID, slug: "rionna", name: "Rionna", metadata: null };

function makeUnprovisionedMember(id: string, userId: string) {
	return {
		id,
		userId,
		organizationId: ORG_ID,
		circleMemberId: null,
		circleStatus: null,
		user: { id: userId, email: `${userId}@test.com`, name: `User ${userId}` },
	};
}

function makeStaleActiveMember(id: string, userId: string, circleMemberId: string) {
	return {
		id,
		userId,
		organizationId: ORG_ID,
		circleMemberId,
		circleStatus: "active",
	};
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe("reconcileCircleMembers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockOrgFindUnique.mockResolvedValue(ORG);
		mockMemberFindManyUnprovisioned.mockResolvedValue([]);
		mockMemberFindManyStale.mockResolvedValue([]);
		mockMemberUpdate.mockResolvedValue({});
	});

	it("returns zeros when no members need reconciliation", async () => {
		const result = await reconcileCircleMembers(ORG_ID);

		expect(result).toEqual({ provisioned: 0, deactivated: 0, errors: 0 });
	});

	it("returns zeros when organization not found", async () => {
		mockOrgFindUnique.mockResolvedValue(null);

		const result = await reconcileCircleMembers("non-existent");

		expect(result).toEqual({ provisioned: 0, deactivated: 0, errors: 0 });
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			"[Reconciliation] Organization not found or missing slug",
			expect.objectContaining({ organizationId: "non-existent" }),
		);
	});

	describe("provisioning unprovisioned members", () => {
		it("provisions members with active Purchase but no circleMemberId", async () => {
			const member = makeUnprovisionedMember("m1", "u1");
			mockMemberFindManyUnprovisioned.mockResolvedValue([member]);
			mockCreateMember.mockResolvedValue({
				ok: true,
				data: { circleMemberId: "circle-123" },
			});

			const result = await reconcileCircleMembers(ORG_ID);

			expect(result.provisioned).toBe(1);
			expect(mockCreateMember).toHaveBeenCalledWith({
				email: "u1@test.com",
				name: "User u1",
				ssoUserId: "u1",
				idempotencyKey: "reconcile-provision-m1",
			});
			expect(mockMemberUpdate).toHaveBeenCalledWith({
				where: { id: "m1" },
				data: expect.objectContaining({
					circleMemberId: "circle-123",
					circleStatus: "active",
				}),
			});
			expect(mockLoggerInfo).toHaveBeenCalledWith(
				"[Reconciliation] Provisioned Circle member",
				expect.objectContaining({ userId: "u1", orgId: ORG_ID }),
			);
		});

		it("provisions multiple members", async () => {
			const members = [
				makeUnprovisionedMember("m1", "u1"),
				makeUnprovisionedMember("m2", "u2"),
				makeUnprovisionedMember("m3", "u3"),
			];
			mockMemberFindManyUnprovisioned.mockResolvedValue(members);
			mockCreateMember
				.mockResolvedValueOnce({ ok: true, data: { circleMemberId: "c-1" } })
				.mockResolvedValueOnce({ ok: true, data: { circleMemberId: "c-2" } })
				.mockResolvedValueOnce({ ok: true, data: { circleMemberId: "c-3" } });

			const result = await reconcileCircleMembers(ORG_ID);

			expect(result.provisioned).toBe(3);
			expect(result.errors).toBe(0);
		});

		it("uses email as name when user.name is null", async () => {
			const member = makeUnprovisionedMember("m1", "u1");
			member.user.name = null as unknown as string;
			mockMemberFindManyUnprovisioned.mockResolvedValue([member]);
			mockCreateMember.mockResolvedValue({
				ok: true,
				data: { circleMemberId: "c-1" },
			});

			await reconcileCircleMembers(ORG_ID);

			expect(mockCreateMember).toHaveBeenCalledWith(
				expect.objectContaining({ name: "u1@test.com" }),
			);
		});
	});

	describe("deactivating stale active members", () => {
		it("deactivates members with canceled Purchase but circleStatus active", async () => {
			const member = makeStaleActiveMember("m1", "u1", "circle-456");
			mockMemberFindManyStale.mockResolvedValue([member]);
			mockDeactivateMember.mockResolvedValue({ ok: true, data: undefined });

			const result = await reconcileCircleMembers(ORG_ID);

			expect(result.deactivated).toBe(1);
			expect(mockDeactivateMember).toHaveBeenCalledWith("circle-456");
			expect(mockMemberUpdate).toHaveBeenCalledWith({
				where: { id: "m1" },
				data: { circleStatus: "deactivated" },
			});
			expect(mockLoggerInfo).toHaveBeenCalledWith(
				"[Reconciliation] Deactivated Circle member",
				expect.objectContaining({ userId: "u1", orgId: ORG_ID }),
			);
		});

		it("deactivates multiple stale members", async () => {
			const members = [
				makeStaleActiveMember("m1", "u1", "c-1"),
				makeStaleActiveMember("m2", "u2", "c-2"),
			];
			mockMemberFindManyStale.mockResolvedValue(members);
			mockDeactivateMember.mockResolvedValue({ ok: true, data: undefined });

			const result = await reconcileCircleMembers(ORG_ID);

			expect(result.deactivated).toBe(2);
			expect(result.errors).toBe(0);
		});
	});

	describe("per-member resilience", () => {
		it("continues provisioning remaining members when one fails (outcome)", async () => {
			const members = [
				makeUnprovisionedMember("m1", "u1"),
				makeUnprovisionedMember("m2", "u2"),
				makeUnprovisionedMember("m3", "u3"),
			];
			mockMemberFindManyUnprovisioned.mockResolvedValue(members);
			mockCreateMember
				.mockResolvedValueOnce({ ok: true, data: { circleMemberId: "c-1" } })
				.mockResolvedValueOnce({
					ok: false,
					reason: "server_error",
					retriable: true,
					raw: "timeout",
				})
				.mockResolvedValueOnce({ ok: true, data: { circleMemberId: "c-3" } });

			const result = await reconcileCircleMembers(ORG_ID);

			expect(result.provisioned).toBe(2);
			expect(result.errors).toBe(1);
			expect(mockCreateMember).toHaveBeenCalledTimes(3);
		});

		it("non-retriable provisioning failure marks member provisioning_failed", async () => {
			const member = makeUnprovisionedMember("m1", "u1");
			mockMemberFindManyUnprovisioned.mockResolvedValue([member]);
			mockCreateMember.mockResolvedValueOnce({
				ok: false,
				reason: "invalid_input",
				retriable: false,
				raw: "bad",
			});

			const result = await reconcileCircleMembers(ORG_ID);

			expect(result.provisioned).toBe(0);
			expect(result.errors).toBe(1);
			expect(mockMemberUpdate).toHaveBeenCalledWith({
				where: { id: "m1" },
				data: { circleStatus: "provisioning_failed" },
			});
		});

		it("continues deactivating remaining members when one fails (outcome)", async () => {
			const members = [
				makeStaleActiveMember("m1", "u1", "c-1"),
				makeStaleActiveMember("m2", "u2", "c-2"),
			];
			mockMemberFindManyStale.mockResolvedValue(members);
			mockDeactivateMember
				.mockResolvedValueOnce({
					ok: false,
					reason: "network",
					retriable: true,
					raw: "flaky",
				})
				.mockResolvedValueOnce({ ok: true, data: undefined });

			const result = await reconcileCircleMembers(ORG_ID);

			expect(result.deactivated).toBe(1);
			expect(result.errors).toBe(1);
			expect(mockDeactivateMember).toHaveBeenCalledTimes(2);
		});

		it("still catches unexpected thrown errors defensively", async () => {
			// Service methods are now supposed to return outcomes, but we keep
			// a defensive try/catch in reconciliation so an unexpected throw
			// (e.g. DB error in the post-success update) doesn't block the loop.
			const members = [
				makeStaleActiveMember("m1", "u1", "c-1"),
				makeStaleActiveMember("m2", "u2", "c-2"),
			];
			mockMemberFindManyStale.mockResolvedValue(members);
			mockDeactivateMember
				.mockRejectedValueOnce(new Error("Unexpected throw"))
				.mockResolvedValueOnce({ ok: true, data: undefined });

			const result = await reconcileCircleMembers(ORG_ID);

			expect(result.deactivated).toBe(1);
			expect(result.errors).toBe(1);
		});

		it("logs errors with structured context", async () => {
			const member = makeUnprovisionedMember("m1", "u1");
			mockMemberFindManyUnprovisioned.mockResolvedValue([member]);
			mockCreateMember.mockResolvedValueOnce({
				ok: false,
				reason: "server_error",
				retriable: true,
				raw: "Circle 503",
			});

			await reconcileCircleMembers(ORG_ID);

			expect(mockLoggerError).toHaveBeenCalledWith(
				"[Reconciliation] Failed to provision member",
				expect.objectContaining({
					userId: "u1",
					orgId: ORG_ID,
					reason: "server_error",
					retriable: true,
				}),
			);
		});

		it("emits circle.provisioning.failed_permanent when a previously-failed member fails again (S6-01 T13)", async () => {
			// Member was already marked provisioning_failed on an earlier
			// reconciliation run. This sweep picks them up (still no
			// circleMemberId) and Circle fails again — that's the signal that
			// this Member is stuck and needs ops attention.
			const member = {
				...makeUnprovisionedMember("m1", "u1"),
				circleStatus: "provisioning_failed",
			};
			mockMemberFindManyUnprovisioned.mockResolvedValue([member]);
			mockCreateMember.mockResolvedValueOnce({
				ok: false,
				reason: "server_error",
				retriable: true,
				raw: "Circle 503",
			});

			await reconcileCircleMembers(ORG_ID);

			expect(mockLoggerError).toHaveBeenCalledWith(
				"circle.provisioning.failed_permanent",
				expect.objectContaining({
					surface: "circle.reconciliation",
					memberId: "m1",
					userId: "u1",
					orgId: ORG_ID,
					circleStatus: "provisioning_failed",
					reason: "server_error",
				}),
			);
		});

		it("does NOT emit circle.provisioning.failed_permanent on first-time failure", async () => {
			// Fresh member — no prior provisioning_failed state. The normal
			// failure log fires but the "permanent" event should not.
			const member = makeUnprovisionedMember("m1", "u1");
			mockMemberFindManyUnprovisioned.mockResolvedValue([member]);
			mockCreateMember.mockResolvedValueOnce({
				ok: false,
				reason: "server_error",
				retriable: true,
				raw: "Circle 503",
			});

			await reconcileCircleMembers(ORG_ID);

			expect(mockLoggerError).not.toHaveBeenCalledWith(
				"circle.provisioning.failed_permanent",
				expect.anything(),
			);
		});
	});

	describe("combined scenarios", () => {
		it("handles both provisioning and deactivation in one run", async () => {
			mockMemberFindManyUnprovisioned.mockResolvedValue([
				makeUnprovisionedMember("m1", "u1"),
			]);
			mockMemberFindManyStale.mockResolvedValue([
				makeStaleActiveMember("m2", "u2", "c-2"),
			]);
			mockCreateMember.mockResolvedValue({
				ok: true,
				data: { circleMemberId: "c-1" },
			});
			mockDeactivateMember.mockResolvedValue({ ok: true, data: undefined });

			const result = await reconcileCircleMembers(ORG_ID);

			expect(result).toEqual({ provisioned: 1, deactivated: 1, errors: 0 });
		});
	});
});
