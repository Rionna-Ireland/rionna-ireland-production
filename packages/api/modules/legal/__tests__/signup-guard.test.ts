/**
 * S12-09 / D39: Better Auth `hooks.before` sign-up guard
 * (packages/auth/lib/signup-guard.ts). Lives here because @repo/auth has no
 * test runner; @repo/api depends on it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvitationFindFirst } = vi.hoisted(() => ({
	mockInvitationFindFirst: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: { invitation: { findFirst: mockInvitationFindFirst } },
}));

import { assertSignupAllowed, SIGNUP_CLOSED_ERROR_CODE } from "@repo/auth/lib/signup-guard";

const ORIGINAL = process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;

beforeEach(() => {
	vi.clearAllMocks();
	delete process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
	mockInvitationFindFirst.mockResolvedValue(null);
});

afterEach(() => {
	if (ORIGINAL === undefined) {
		delete process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
	} else {
		process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN = ORIGINAL;
	}
});

describe("assertSignupAllowed", () => {
	it("allows anyone when public signup is open", async () => {
		process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN = "true";

		await expect(assertSignupAllowed({ email: "x@example.com" })).resolves.toBeUndefined();
		expect(mockInvitationFindFirst).not.toHaveBeenCalled();
	});

	it("refuses an uninvited email while closed (default)", async () => {
		await expect(assertSignupAllowed({ email: "x@example.com" })).rejects.toMatchObject({
			status: "FORBIDDEN",
			body: expect.objectContaining({ code: SIGNUP_CLOSED_ERROR_CODE }),
		});
	});

	it("allows an email with a pending, unexpired invitation while closed", async () => {
		mockInvitationFindFirst.mockResolvedValue({ id: "inv1" });

		await expect(
			assertSignupAllowed({ email: " Admin@Example.com " }),
		).resolves.toBeUndefined();

		const [args] = mockInvitationFindFirst.mock.calls[0];
		expect(args.where).toMatchObject({
			email: { equals: "Admin@Example.com", mode: "insensitive" },
			status: "pending",
		});
		expect(args.where.expiresAt.gt).toBeInstanceOf(Date);
	});

	it("refuses a missing or malformed body while closed", async () => {
		await expect(assertSignupAllowed(undefined)).rejects.toMatchObject({ status: "FORBIDDEN" });
		await expect(assertSignupAllowed({ email: 42 })).rejects.toMatchObject({
			status: "FORBIDDEN",
		});
		expect(mockInvitationFindFirst).not.toHaveBeenCalled();
	});
});
