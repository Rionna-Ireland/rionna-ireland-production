/**
 * S17-01 (W-01, W-02, W-03, W-15) and S17-08 (W-20): drives the real `auth`
 * instance. Prisma is swapped for better-auth's in-memory adapter so endpoints,
 * hooks and session checks run exactly as configured in auth.ts.
 */

import { memoryAdapter } from "better-auth/adapters/memory";
import { makeSignature } from "better-auth/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	store,
	mockCancelSubscription,
	mockDeleteCircleMember,
	mockSetSubscriptionSeats,
	mockGetPurchasesByUserId,
	mockDb,
} = vi.hoisted(() => ({
	store: {} as Record<string, Record<string, unknown>[]>,
	mockCancelSubscription: vi.fn(),
	mockDeleteCircleMember: vi.fn(),
	mockSetSubscriptionSeats: vi.fn(),
	mockGetPurchasesByUserId: vi.fn(),
	mockDb: { member: { findMany: vi.fn() } },
}));

vi.mock("better-auth/adapters/prisma", () => ({
	prismaAdapter: () => memoryAdapter(store),
}));

vi.mock("@repo/database", () => ({
	db: mockDb,
	getInvitationById: vi.fn(async () => ({ id: "inv_1", organizationId: "org_club" })),
	getOrganizationWithPurchasesAndMembersCount: vi.fn(async () => ({
		id: "org_club",
		membersCount: 300,
		purchases: [{ type: "SUBSCRIPTION", subscriptionId: "sub_victim" }],
	})),
	getPurchasesByOrganizationId: vi.fn(async () => [
		{ id: "p_other", type: "SUBSCRIPTION", subscriptionId: "sub_other" },
	]),
	getPurchasesByUserId: mockGetPurchasesByUserId,
	getUserByEmail: vi.fn(),
	getUserById: vi.fn(async () => null),
}));

vi.mock("@repo/payments", () => ({
	cancelSubscription: mockCancelSubscription,
	deleteCircleMember: mockDeleteCircleMember,
	setSubscriptionSeats: mockSetSubscriptionSeats,
}));

vi.mock("@repo/logs", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@repo/mail", () => ({ sendEmail: vi.fn() }));
vi.mock("@repo/notifications", () => ({ createWelcomeNotification: vi.fn() }));

import { auth } from "../auth";

const ORG_ID = "org_club";
const USER_ID = "user_1";

async function sessionHeaders(userId: string) {
	const ctx = await auth.$context;
	const token = `token_${userId}`;
	store.session.push({
		id: `session_${userId}`,
		token,
		userId,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	const signed = `${token}.${await makeSignature(token, ctx.secret)}`;
	return new Headers({
		cookie: `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(signed)}`,
	});
}

function post(path: string, body: unknown) {
	return auth.handler(
		new Request(`http://localhost:3000/api/auth${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: "http://localhost:3000" },
			body: JSON.stringify(body),
		}),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	for (const model of [
		"user",
		"session",
		"account",
		"verification",
		"organization",
		"member",
		"invitation",
	]) {
		store[model] = [];
	}
	store.user.push({
		id: USER_ID,
		name: "Member",
		email: "member@example.com",
		emailVerified: true,
		role: "user",
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	mockGetPurchasesByUserId.mockResolvedValue([
		{ id: "p_1", type: "SUBSCRIPTION", subscriptionId: "sub_1", status: "active" },
	]);
	mockDb.member.findMany.mockResolvedValue([
		{ id: "member_1", userId: USER_ID, organizationId: ORG_ID, circleMemberId: "circle_1" },
	]);
});

describe("unauthenticated delete requests", () => {
	it("POST /organization/delete with an organizationId cancels nothing", async () => {
		const res = await post("/organization/delete", { organizationId: ORG_ID });

		expect(res.ok).toBe(false);
		expect(mockCancelSubscription).not.toHaveBeenCalled();
	});

	it("POST /delete-user with an organizationId in the body cancels nothing", async () => {
		const res = await post("/delete-user", { organizationId: ORG_ID });

		expect(res.ok).toBe(false);
		expect(mockCancelSubscription).not.toHaveBeenCalled();
	});
});

describe("unauthenticated organization requests", () => {
	it("POST /organization/remove-member with an organizationId changes no seats", async () => {
		const res = await post("/organization/remove-member", {
			organizationId: ORG_ID,
			memberIdOrEmail: "anyone@example.com",
		});

		expect(res.ok).toBe(false);
		expect(mockSetSubscriptionSeats).not.toHaveBeenCalled();
	});

	it("POST /organization/accept-invitation with an invitationId changes no seats", async () => {
		const res = await post("/organization/accept-invitation", { invitationId: "inv_1" });

		expect(res.ok).toBe(false);
		expect(mockSetSubscriptionSeats).not.toHaveBeenCalled();
	});
});

describe("user deletion cascade", () => {
	it("cancels the user's subscription and deletes their Circle member", async () => {
		const headers = await sessionHeaders(USER_ID);

		await auth.api.deleteUser({ headers, body: {} });

		expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
		expect(mockCancelSubscription).toHaveBeenCalledWith("sub_1");
		expect(mockDeleteCircleMember).toHaveBeenCalledTimes(1);
		expect(mockDeleteCircleMember).toHaveBeenCalledWith("circle_1");
		expect(store.user).toHaveLength(0);
	});

	it("keeps the user and their session when Stripe cancellation fails", async () => {
		const headers = await sessionHeaders(USER_ID);
		mockCancelSubscription.mockRejectedValueOnce(new Error("stripe down"));

		await expect(auth.api.deleteUser({ headers, body: {} })).rejects.toThrow("stripe down");

		expect(store.user).toHaveLength(1);
		expect(store.session).toHaveLength(1);
	});

	it("skips ended subscriptions so a lapsed member can still delete their account", async () => {
		const headers = await sessionHeaders(USER_ID);
		mockGetPurchasesByUserId.mockResolvedValue([
			{ id: "p_1", type: "SUBSCRIPTION", subscriptionId: "sub_canceled", status: "canceled" },
			{
				id: "p_2",
				type: "SUBSCRIPTION",
				subscriptionId: "sub_expired",
				status: "incomplete_expired",
			},
			{ id: "p_3", type: "SUBSCRIPTION", subscriptionId: "sub_d29", status: "rejected_d29" },
			{ id: "p_4", type: "SUBSCRIPTION", subscriptionId: "sub_unpaid", status: "unpaid" },
		]);
		// Stripe rejects cancelling a subscription that is already cancelled.
		mockCancelSubscription.mockImplementation(async (id: string) => {
			if (id !== "sub_unpaid") throw new Error(`${id} is already canceled`);
		});

		await auth.api.deleteUser({ headers, body: {} });

		expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
		expect(mockCancelSubscription).toHaveBeenCalledWith("sub_unpaid");
		expect(store.user).toHaveLength(0);
	});
});

describe("organization creation and deletion", () => {
	it("rejects org creation by a staff admin", async () => {
		store.user[0].role = "admin";
		const headers = await sessionHeaders(USER_ID);

		await expect(
			auth.api.createOrganization({ headers, body: { name: "Phish", slug: "phish" } }),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
		expect(store.organization).toHaveLength(0);
	});

	it("rejects org deletion by an authenticated owner", async () => {
		store.organization.push({ id: ORG_ID, name: "Club", slug: "club", createdAt: new Date() });
		store.member.push({
			id: "member_1",
			organizationId: ORG_ID,
			userId: USER_ID,
			role: "owner",
			createdAt: new Date(),
		});
		const headers = await sessionHeaders(USER_ID);

		await expect(
			auth.api.deleteOrganization({ headers, body: { organizationId: ORG_ID } }),
		).rejects.toMatchObject({ status: "NOT_FOUND" });
		expect(store.organization).toHaveLength(1);
	});
});

describe("admin plugin endpoints (S17-08 / W-20)", () => {
	const CALLER_ID = "caller_1";

	async function callerHeaders(role: string) {
		store.user.push({
			id: CALLER_ID,
			name: "Caller",
			email: "caller@example.com",
			emailVerified: true,
			role,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		return sessionHeaders(CALLER_ID);
	}

	const calls = {
		"set-role on self": (headers: Headers) =>
			auth.api.setRole({ headers, body: { userId: CALLER_ID, role: "platformAdmin" } }),
		"remove-user": (headers: Headers) =>
			auth.api.removeUser({ headers, body: { userId: USER_ID } }),
		"impersonate-user": (headers: Headers) =>
			auth.api.impersonateUser({ headers, body: { userId: USER_ID } }),
		"set-user-password": (headers: Headers) =>
			auth.api.setUserPassword({
				headers,
				body: { userId: USER_ID, newPassword: "hijacked-123" },
			}),
	};
	const cases = ["admin", "user"].flatMap((role) =>
		Object.keys(calls).map((endpoint) => [role, endpoint] as const),
	);

	it.each(cases)("refuses %s calling %s", async (role, endpoint) => {
		const headers = await callerHeaders(role);

		await expect(calls[endpoint as keyof typeof calls](headers)).rejects.toMatchObject({
			status: "FORBIDDEN",
		});

		expect(store.user.find((u) => u.id === CALLER_ID)?.role).toBe(role);
		expect(store.user.find((u) => u.id === USER_ID)).toBeDefined();
		expect(store.session).toHaveLength(1);
		expect(store.account).toHaveLength(0);
	});

	it("lets a platformAdmin set an allowed role but not an unknown one", async () => {
		const headers = await callerHeaders("platformAdmin");

		await auth.api.setRole({ headers, body: { userId: USER_ID, role: "admin" } });
		expect(store.user.find((u) => u.id === USER_ID)?.role).toBe("admin");

		await expect(
			auth.api.setRole({ headers, body: { userId: USER_ID, role: "superuser" as "admin" } }),
		).rejects.toMatchObject({ status: "BAD_REQUEST" });
		expect(store.user.find((u) => u.id === USER_ID)?.role).toBe("admin");
	});
});
