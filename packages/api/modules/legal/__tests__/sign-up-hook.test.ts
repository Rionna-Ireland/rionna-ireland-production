/**
 * S12-09 / D39: the real Better Auth instance (packages/auth/auth.ts) runs the
 * sign-up guard as a `hooks.before` on `/sign-up/email`, before any user is
 * created. Exercises `auth.api.signUpEmail` end to end with the DB mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvitationFindFirst, mockUserCreate } = vi.hoisted(() => ({
	mockInvitationFindFirst: vi.fn(),
	mockUserCreate: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		invitation: { findFirst: mockInvitationFindFirst },
		user: { create: mockUserCreate, findFirst: vi.fn(async () => null) },
	},
	getInvitationById: vi.fn(),
	getPurchasesByOrganizationId: vi.fn(),
	getPurchasesByUserId: vi.fn(),
	getUserByEmail: vi.fn(),
	getUserById: vi.fn(),
}));
vi.mock("@repo/mail", () => ({ sendEmail: vi.fn() }));
vi.mock("@repo/notifications", () => ({ createWelcomeNotification: vi.fn() }));
vi.mock("@repo/payments", () => ({
	cancelSubscription: vi.fn(),
	deleteCircleMember: vi.fn(),
	setSubscriptionSeats: vi.fn(),
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { auth } from "@repo/auth";

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

describe("auth hooks.before — /sign-up/email while signup is closed", () => {
	it("refuses an uninvited sign-up before creating a user", async () => {
		await expect(
			auth.api.signUpEmail({
				body: { email: "x@example.com", password: "Password123!", name: "X" },
			}),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			body: expect.objectContaining({ code: "SIGNUP_CLOSED" }),
		});

		expect(mockInvitationFindFirst).toHaveBeenCalledTimes(1);
		expect(mockUserCreate).not.toHaveBeenCalled();
	});

	it("lets an invited email through to the sign-up endpoint", async () => {
		mockInvitationFindFirst.mockResolvedValue({ id: "inv1" });

		// The mocked DB can't complete a real sign-up; what matters is that the
		// guard did not refuse it (the endpoint went on to create the user).
		const outcome = await auth.api
			.signUpEmail({
				body: { email: "admin@example.com", password: "Password123!", name: "A" },
			})
			.then(
				() => null,
				(error: unknown) => error,
			);

		expect(outcome).not.toMatchObject({ body: { code: "SIGNUP_CLOSED" } });
		expect(mockInvitationFindFirst).toHaveBeenCalledTimes(1);
		expect(mockUserCreate).toHaveBeenCalled();
	});
});
