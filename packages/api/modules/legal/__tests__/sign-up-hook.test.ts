/**
 * S12-09 / D39: the real Better Auth instance (packages/auth/auth.ts) runs the
 * sign-up guard as a `hooks.before` on `/sign-up/email`, before any user is
 * created. Exercises `auth.api.signUpEmail` end to end with the DB mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockInvitationFindFirst,
	mockUserCreate,
	mockOrgFindFirst,
	mockAcceptanceCreate,
	mockLogger,
} = vi.hoisted(() => ({
	mockInvitationFindFirst: vi.fn(),
	mockUserCreate: vi.fn(),
	mockOrgFindFirst: vi.fn(),
	mockAcceptanceCreate: vi.fn(),
	mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@repo/database", () => ({
	db: {
		invitation: { findFirst: mockInvitationFindFirst },
		user: { create: mockUserCreate, findFirst: vi.fn(async () => null) },
		organization: { findFirst: mockOrgFindFirst },
		legalAcceptance: { createMany: mockAcceptanceCreate },
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
vi.mock("@repo/logs", () => ({ logger: mockLogger }));

import { auth } from "@repo/auth";
import { CURRENT_AGE_CONFIRMATION_VERSION, CURRENT_TERMS_VERSION } from "@repo/utils";

/** The legal fields the sign-up form sends (not in the inferred body type). */
const ACCEPTED = { acceptedTermsVersion: CURRENT_TERMS_VERSION, confirmedOver18: true };

function withTerms<T extends object>(body: T) {
	const withField = { ...body, ...ACCEPTED };
	return withField;
}

const ORIGINAL = process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;

beforeEach(() => {
	vi.clearAllMocks();
	delete process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
	mockInvitationFindFirst.mockResolvedValue(null);
	mockOrgFindFirst.mockResolvedValue({ id: "club-org" });
	mockAcceptanceCreate.mockResolvedValue({ count: 2 });
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
				body: withTerms({ email: "x@example.com", password: "Password123!", name: "X" }),
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
				body: withTerms({
					email: "admin@example.com",
					password: "Password123!",
					name: "A",
				}),
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

describe("auth hooks — terms acceptance at sign-up (S12-10)", () => {
	const OPEN_SIGNUP = "true";

	function signUp(extra: Record<string, unknown> = {}) {
		const body = { email: "new@example.com", password: "Password123!", name: "N", ...extra };
		return auth.api.signUpEmail({ body }).then(
			() => null,
			(error: unknown) => error,
		);
	}

	beforeEach(() => {
		process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN = OPEN_SIGNUP;
		mockUserCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
			id: "user-1",
			createdAt: new Date(),
			updatedAt: new Date(),
			...data,
		}));
	});

	it("rejects a sign-up without acceptedTermsVersion before creating a user", async () => {
		expect(await signUp()).toMatchObject({
			status: "BAD_REQUEST",
			body: expect.objectContaining({ code: "TERMS_NOT_ACCEPTED" }),
		});
		expect(mockUserCreate).not.toHaveBeenCalled();
		expect(mockAcceptanceCreate).not.toHaveBeenCalled();
	});

	it("rejects a sign-up without the 18+ confirmation", async () => {
		for (const confirmedOver18 of [undefined, false, "true"]) {
			expect(
				await signUp({ acceptedTermsVersion: CURRENT_TERMS_VERSION, confirmedOver18 }),
			).toMatchObject({
				status: "BAD_REQUEST",
				body: expect.objectContaining({ code: "TERMS_NOT_ACCEPTED" }),
			});
		}
		expect(mockUserCreate).not.toHaveBeenCalled();
		expect(mockAcceptanceCreate).not.toHaveBeenCalled();
	});

	it("rejects a stale terms version", async () => {
		expect(await signUp({ ...ACCEPTED, acceptedTermsVersion: "1999-01-01" })).toMatchObject({
			status: "BAD_REQUEST",
			body: expect.objectContaining({ code: "TERMS_NOT_ACCEPTED" }),
		});
		expect(mockUserCreate).not.toHaveBeenCalled();
		expect(mockAcceptanceCreate).not.toHaveBeenCalled();
	});

	it("records web_signup terms and 18+ acceptances for the created user", async () => {
		await signUp(ACCEPTED);

		expect(mockUserCreate).toHaveBeenCalled();
		expect(mockAcceptanceCreate).toHaveBeenCalledTimes(1);
		expect(mockAcceptanceCreate).toHaveBeenCalledWith({
			data: [
				{
					userId: "user-1",
					organizationId: "club-org",
					document: "terms",
					version: CURRENT_TERMS_VERSION,
					source: "web_signup",
				},
				{
					userId: "user-1",
					organizationId: "club-org",
					document: "age_confirmation",
					version: CURRENT_AGE_CONFIRMATION_VERSION,
					source: "web_signup",
				},
			],
		});
		expect(mockOrgFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({ orderBy: { createdAt: "asc" } }),
		);
	});

	it("does not fail the sign-up when recording throws, and logs without the email", async () => {
		mockAcceptanceCreate.mockRejectedValue(new Error("db down"));

		const outcome = await signUp(ACCEPTED);

		expect(outcome).not.toMatchObject({ body: { code: "TERMS_NOT_ACCEPTED" } });
		expect(mockAcceptanceCreate).toHaveBeenCalled();
		expect(mockLogger.error).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ userId: "user-1" }),
		);
		expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain("new@example.com");
	});
});
