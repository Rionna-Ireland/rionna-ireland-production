/**
 * deactivateCircleMember return contract (S2-10).
 *
 * The guided-removal orchestration (members.admin.remove) deactivates Circle
 * inline and needs to know whether it succeeded so it can decide whether to
 * proceed to the irreversible Member-row delete. So deactivateCircleMember
 * returns a boolean: true when the Circle space was deactivated, false when it
 * failed (deferred to reconciliation / the webhook retry). The Stripe webhook
 * caller ignores the return — unchanged behaviour.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockMemberFindUnique,
	mockMemberUpdate,
	mockDeactivateMember,
	mockLoggerInfo,
	mockLoggerError,
} = vi.hoisted(() => ({
	mockMemberFindUnique: vi.fn(),
	mockMemberUpdate: vi.fn(),
	mockDeactivateMember: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerError: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		member: {
			findUnique: mockMemberFindUnique,
			update: mockMemberUpdate,
		},
	},
}));

vi.mock("@repo/logs", () => ({
	logger: {
		info: mockLoggerInfo,
		warn: vi.fn(),
		error: mockLoggerError,
		log: vi.fn(),
	},
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({
		deactivateMember: mockDeactivateMember,
	})),
}));

import { deactivateCircleMember } from "@repo/payments/lib/circle-provisioning";

const DB_MEMBER = {
	id: "m1",
	organizationId: "org-rionna",
	circleMemberId: "circle-1",
	organization: { slug: "rionna" },
};

describe("deactivateCircleMember — return contract", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMemberFindUnique.mockResolvedValue(DB_MEMBER);
		mockMemberUpdate.mockResolvedValue({});
		mockDeactivateMember.mockResolvedValue({ ok: true, data: undefined });
	});

	it("returns true and marks the member deactivated on success", async () => {
		const ok = await deactivateCircleMember({
			id: "m1",
			circleMemberId: "circle-1",
		});

		expect(ok).toBe(true);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { circleStatus: "deactivated" },
		});
	});

	it("returns false when the Circle service reports failure", async () => {
		mockDeactivateMember.mockResolvedValue({
			ok: false,
			reason: "server_error",
			retriable: true,
		});

		const ok = await deactivateCircleMember({
			id: "m1",
			circleMemberId: "circle-1",
		});

		expect(ok).toBe(false);
		expect(mockMemberUpdate).not.toHaveBeenCalled();
	});

	it("returns false when the member's organization can't be resolved", async () => {
		mockMemberFindUnique.mockResolvedValue(null);

		const ok = await deactivateCircleMember({
			id: "m1",
			circleMemberId: "circle-1",
		});

		expect(ok).toBe(false);
	});
});
