/**
 * S6-03: Circle session revoke — logout fail-open
 *
 * Verifies revokeSession (POST /circle/revoke-session):
 * - Calls revokeMemberSession with the supplied accessToken and the member's
 *   persisted circleRefreshToken.
 * - Clears the stored circleRefreshToken regardless of outcome.
 * - Is fail-open: a failing revoke never throws and the token is still cleared.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ──────────────────────────────────────────────
// Mocks — vi.mock calls are hoisted, so use vi.hoisted
// ──────────────────────────────────────────────

const {
	mockGetSession,
	mockMemberFindFirst,
	mockMemberUpdate,
	mockRevokeMemberSession,
	mockLoggerWarn,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockMemberUpdate: vi.fn(),
	mockRevokeMemberSession: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
	auth: {
		api: { getSession: mockGetSession },
	},
}));

vi.mock("@repo/database", () => ({
	db: {
		member: {
			findFirst: mockMemberFindFirst,
			update: mockMemberUpdate,
		},
	},
}));

vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		warn: mockLoggerWarn,
		error: vi.fn(),
		log: vi.fn(),
	},
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({
		revokeMemberSession: mockRevokeMemberSession,
	})),
}));

// ──────────────────────────────────────────────
// Import the procedure under test (after mocks)
// ──────────────────────────────────────────────

import { revokeSession } from "../procedures/revoke-session";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: "org-rionna" };

const ctx = { context: { headers: new Headers() } };

describe("revokeSession — logout fail-open (S6-03)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockMemberFindFirst.mockResolvedValue({
			id: "m1",
			circleMemberId: "circle-123",
			circleRefreshToken: "ref",
			organization: { slug: "rionna" },
		});
		mockMemberUpdate.mockResolvedValue({});
		mockRevokeMemberSession.mockResolvedValue({ ok: true, data: undefined });
	});

	it("revokes with the access token + persisted refresh token, clears the token, returns ok", async () => {
		const result = await call(revokeSession, { accessToken: "tok" }, ctx);

		expect(mockRevokeMemberSession).toHaveBeenCalledWith({
			accessToken: "tok",
			refreshToken: "ref",
		});
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: {
				circleRefreshToken: null,
				circleAccessToken: null,
				circleAccessTokenExpiresAt: null,
			},
		});
		expect(result).toEqual({ ok: true });
	});

	it("fail-open: a failing revoke still clears the token and returns ok without throwing", async () => {
		mockRevokeMemberSession.mockResolvedValue({
			ok: false,
			reason: "server_error",
			retriable: true,
			raw: "Circle 503",
		});

		const result = await call(revokeSession, { accessToken: "tok" }, ctx);

		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: {
				circleRefreshToken: null,
				circleAccessToken: null,
				circleAccessTokenExpiresAt: null,
			},
		});
		expect(result).toEqual({ ok: true });
	});

	it("returns ok without revoking when there is no member / no circleMemberId", async () => {
		mockMemberFindFirst.mockResolvedValue(null);

		const result = await call(revokeSession, { accessToken: "tok" }, ctx);

		expect(mockRevokeMemberSession).not.toHaveBeenCalled();
		expect(mockMemberUpdate).not.toHaveBeenCalled();
		expect(result).toEqual({ ok: true });
	});
});
