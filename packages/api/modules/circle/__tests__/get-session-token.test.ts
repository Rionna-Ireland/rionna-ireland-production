/**
 * S6-03: Circle session token — refresh-token persistence + lazy profile confirm
 *
 * Verifies getSessionToken (POST /circle/session-token):
 * - The minted token response includes `expiresAt`.
 * - The member's `circleRefreshToken` is persisted after a successful mint so
 *   logout can later revoke it.
 * - When `circleProfileConfirmedAt` is null, the member's Circle profile is
 *   lazily confirmed (idempotent) and the column is recorded.
 * - When `circleProfileConfirmedAt` is already set, confirm is NOT called.
 * - The lazy confirm is fail-open: a failing confirm never throws.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ──────────────────────────────────────────────
// Mocks — vi.mock calls are hoisted, so use vi.hoisted
// ──────────────────────────────────────────────

const {
	mockGetSession,
	mockOrgFindUnique,
	mockUserFindUnique,
	mockMemberFindFirst,
	mockMemberUpdate,
	mockGetMemberToken,
	mockConfirmMemberProfile,
	mockLoggerError,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockUserFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockMemberUpdate: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockConfirmMemberProfile: vi.fn(),
	mockLoggerError: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
	auth: {
		api: { getSession: mockGetSession },
	},
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		user: { findUnique: mockUserFindUnique },
		member: {
			findFirst: mockMemberFindFirst,
			update: mockMemberUpdate,
		},
	},
	parseOrgMetadata: vi.fn(() => ({ circle: { communityDomain: "rionna.circle.so" } })),
}));

vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: mockLoggerError,
		log: vi.fn(),
	},
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({
		getMemberToken: mockGetMemberToken,
		confirmMemberProfile: mockConfirmMemberProfile,
	})),
	getCircleMode: vi.fn(() => "mock"),
	getCircleCommunityBaseUrl: vi.fn(() => "https://rionna.circle.so"),
	buildCircleCommunityTargetUrl: vi.fn(() => "https://rionna.circle.so/__mock/ui/member"),
}));

// ──────────────────────────────────────────────
// Import the procedure under test (after mocks)
// ──────────────────────────────────────────────

import { getSessionToken } from "../procedures/get-session-token";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const ORG_ID = "org-rionna";
const ORG = { id: ORG_ID, slug: "rionna", name: "Rionna", metadata: null };
const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: ORG_ID };
const CIRCLE_MEMBER_ID = "circle-123";
const TOKENS = {
	accessToken: "access-abc",
	refreshToken: "refresh-xyz",
	expiresAt: "2026-06-10T12:00:00.000Z",
};

const ctx = { context: { headers: new Headers() } };

describe("getSessionToken — refresh persistence + lazy confirm (S6-03)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue(ORG);
		mockUserFindUnique.mockResolvedValue(USER);
		mockMemberFindFirst.mockResolvedValue({
			id: "m1",
			circleMemberId: CIRCLE_MEMBER_ID,
			circleProfileConfirmedAt: null,
		});
		mockMemberUpdate.mockResolvedValue({});
		mockGetMemberToken.mockResolvedValue({ ok: true, data: TOKENS });
		mockConfirmMemberProfile.mockResolvedValue({ ok: true, data: undefined });
	});

	it("includes expiresAt in the response", async () => {
		const result = await call(getSessionToken, {}, ctx);

		expect(result).toMatchObject({
			accessToken: TOKENS.accessToken,
			expiresAt: TOKENS.expiresAt,
		});
	});

	it("persists the refresh token after a successful mint", async () => {
		await call(getSessionToken, {}, ctx);

		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { circleRefreshToken: TOKENS.refreshToken },
		});
	});

	it("lazily confirms the profile and records circleProfileConfirmedAt when not yet confirmed", async () => {
		await call(getSessionToken, {}, ctx);

		expect(mockConfirmMemberProfile).toHaveBeenCalledWith(
			CIRCLE_MEMBER_ID,
			USER.name,
		);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { circleProfileConfirmedAt: expect.any(Date) },
		});
	});

	it("does NOT confirm the profile when already confirmed", async () => {
		mockMemberFindFirst.mockResolvedValue({
			id: "m1",
			circleMemberId: CIRCLE_MEMBER_ID,
			circleProfileConfirmedAt: new Date("2026-01-01T00:00:00.000Z"),
		});

		await call(getSessionToken, {}, ctx);

		expect(mockConfirmMemberProfile).not.toHaveBeenCalled();
		expect(mockMemberUpdate).not.toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { circleProfileConfirmedAt: expect.any(Date) },
		});
	});

	it("fail-open: a failing confirm does not throw and does not record the column", async () => {
		mockConfirmMemberProfile.mockResolvedValue({
			ok: false,
			reason: "server_error",
			retriable: true,
			raw: "Circle 503",
		});

		await expect(call(getSessionToken, {}, ctx)).resolves.toMatchObject({
			expiresAt: TOKENS.expiresAt,
		});

		expect(mockMemberUpdate).not.toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { circleProfileConfirmedAt: expect.any(Date) },
		});
	});
});
