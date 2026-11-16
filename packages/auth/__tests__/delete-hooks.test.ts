/**
 * S17-01 (W-01, W-02, W-03, W-15): drives the real `auth` instance. Prisma is
 * swapped for better-auth's in-memory adapter so endpoints, hooks and session
 * checks run exactly as configured in auth.ts.
 */

import { memoryAdapter } from "better-auth/adapters/memory";
import { makeSignature } from "better-auth/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, mockCancelSubscription, mockDeleteCircleMember, mockDb } = vi.hoisted(() => ({
	store: {} as Record<string, Record<string, unknown>[]>,
	mockCancelSubscription: vi.fn(),
	mockDeleteCircleMember: vi.fn(),
	mockDb: { member: { findMany: vi.fn() } },
}));

vi.mock("better-auth/adapters/prisma", () => ({
	prismaAdapter: () => memoryAdapter(store),
}));

vi.mock("@repo/database", () => ({
	db: mockDb,
	getInvitationById: vi.fn(),
	getOrganizationWithPurchasesAndMembersCount: vi.fn(),
	getPurchasesByOrganizationId: vi.fn(async () => [
		{ id: "p_other", type: "SUBSCRIPTION", subscriptionId: "sub_other" },
	]),
	getPurchasesByUserId: vi.fn(async () => [
		{ id: "p_1", type: "SUBSCRIPTION", subscriptionId: "sub_1" },
	]),
	getUserByEmail: vi.fn(),
	getUserById: vi.fn(async () => null),
}));

vi.mock("@repo/payments", () => ({
	cancelSubscription: mockCancelSubscription,
	deleteCircleMember: mockDeleteCircleMember,
	setSubscriptionSeats: vi.fn(),
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
		role: "member",
		createdAt: new Date(),
		updatedAt: new Date(),
	});
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
});

describe("organization creation", () => {
	it("rejects a user with role member", async () => {
		const headers = await sessionHeaders(USER_ID);

		await expect(
			auth.api.createOrganization({ headers, body: { name: "Phish", slug: "phish" } }),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
		expect(store.organization).toHaveLength(0);
	});
});
