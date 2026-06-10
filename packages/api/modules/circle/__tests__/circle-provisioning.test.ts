/**
 * S6-03: Circle profile pre-confirmation during provisioning
 *
 * Verifies provisionCircleMember (from @repo/payments/lib/circle-provisioning):
 * - After a successful createMember, the member's Circle profile is
 *   pre-confirmed via confirmMemberProfile(circleMemberId, name).
 * - When confirm succeeds, member.circleProfileConfirmedAt is recorded.
 * - When confirm fails it is fail-open: provisioning still succeeds (no throw),
 *   the member stays marked active, and we log a warning rather than blocking.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ──────────────────────────────────────────────
// Mocks — vi.mock calls are hoisted, so use vi.hoisted
// ──────────────────────────────────────────────

const {
	mockOrgFindUnique,
	mockUserFindUnique,
	mockMemberUpdate,
	mockCreateMember,
	mockConfirmMemberProfile,
	mockLoggerInfo,
	mockLoggerWarn,
	mockLoggerError,
} = vi.hoisted(() => ({
	mockOrgFindUnique: vi.fn(),
	mockUserFindUnique: vi.fn(),
	mockMemberUpdate: vi.fn(),
	mockCreateMember: vi.fn(),
	mockConfirmMemberProfile: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
	mockLoggerError: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		user: { findUnique: mockUserFindUnique },
		member: { update: mockMemberUpdate },
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
		deactivateMember: vi.fn(),
		reactivateMember: vi.fn(),
		deleteMember: vi.fn(),
		getMemberToken: vi.fn(),
		getMemberNotifications: vi.fn(),
		confirmMemberProfile: mockConfirmMemberProfile,
	})),
}));

// ──────────────────────────────────────────────
// Import the function under test
// ──────────────────────────────────────────────

import { provisionCircleMember } from "@repo/payments/lib/circle-provisioning";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const ORG_ID = "org-rionna";
const ORG = { id: ORG_ID, slug: "rionna", name: "Rionna", metadata: null };
const MEMBER = { id: "m1", userId: "u1", organizationId: ORG_ID };
const USER = { id: "u1", email: "u1@test.com", name: "User One" };
const CIRCLE_MEMBER_ID = "circle-123";

describe("provisionCircleMember — profile pre-confirmation (S6-03)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockOrgFindUnique.mockResolvedValue(ORG);
		mockUserFindUnique.mockResolvedValue(USER);
		mockMemberUpdate.mockResolvedValue({});
		mockCreateMember.mockResolvedValue({
			ok: true,
			data: { circleMemberId: CIRCLE_MEMBER_ID },
		});
		mockConfirmMemberProfile.mockResolvedValue({ ok: true, data: undefined });
	});

	it("pre-confirms the new member's profile with (circleMemberId, name)", async () => {
		await provisionCircleMember(MEMBER, "idem-key");

		expect(mockConfirmMemberProfile).toHaveBeenCalledWith(
			CIRCLE_MEMBER_ID,
			USER.name,
		);
	});

	it("uses email as the profile name when user.name is null", async () => {
		mockUserFindUnique.mockResolvedValue({ ...USER, name: null });

		await provisionCircleMember(MEMBER, "idem-key");

		expect(mockConfirmMemberProfile).toHaveBeenCalledWith(
			CIRCLE_MEMBER_ID,
			USER.email,
		);
	});

	it("records circleProfileConfirmedAt when confirm succeeds", async () => {
		await provisionCircleMember(MEMBER, "idem-key");

		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { circleProfileConfirmedAt: expect.any(Date) },
		});
	});

	it("fail-open: provisioning still succeeds and member stays active when confirm fails", async () => {
		mockConfirmMemberProfile.mockResolvedValue({
			ok: false,
			reason: "server_error",
			retriable: true,
			raw: "Circle 503",
		});

		await expect(provisionCircleMember(MEMBER, "idem-key")).resolves.toBeUndefined();

		// Member was still marked active from the successful createMember branch.
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: expect.objectContaining({
				circleMemberId: CIRCLE_MEMBER_ID,
				circleStatus: "active",
			}),
		});

		// But circleProfileConfirmedAt is NOT recorded on failure.
		expect(mockMemberUpdate).not.toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { circleProfileConfirmedAt: expect.any(Date) },
		});

		// And we log a warning rather than throwing.
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			"[Circle] Profile pre-confirm failed; will retry lazily on first session",
			expect.objectContaining({
				surface: "circle.provisioning",
				memberId: "m1",
				reason: "server_error",
			}),
		);
	});
});
