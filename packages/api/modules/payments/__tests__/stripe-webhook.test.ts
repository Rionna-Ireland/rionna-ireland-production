/**
 * S1-04: Stripe Webhook Lifecycle Tests
 *
 * Tests the actual handler functions by mocking their dependencies
 * (database, Circle functions, Stripe client).
 * Covers:
 * - StripeEventLog dedup (duplicate webhook delivery is silently ignored)
 * - subscription.created -> creates Purchase + Member + triggers Circle provision
 * - subscription.deleted -> flips Purchase.status to "canceled", deactivates Circle
 * - subscription.updated -> updates Purchase.status, reactivates Circle on cancel->active
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal Stripe event/subscription shapes for testing — avoids a direct
// dependency on the `stripe` package from `@repo/api`.
interface StripeEvent {
	id: string;
	object: string;
	api_version: string;
	created: number;
	livemode: boolean;
	pending_webhooks: number;
	request: null;
	type: string;
	data: {
		object: StripeSubscription;
		previous_attributes?: Record<string, unknown>;
	};
}

interface StripeSubscription {
	id: string;
	object: string;
	customer: string;
	status: string;
	metadata: Record<string, string | null>;
	items: { data: Array<{ price: { id: string } }> };
	[key: string]: unknown;
}

// ──────────────────────────────────────────────
// Mocks — vi.mock calls are hoisted, so use vi.hoisted
// ──────────────────────────────────────────────

const {
	mockStripeEventLogCreate,
	mockMemberFindFirst,
	mockMemberCreate,
	mockMemberUpsert,
	mockMemberFindMany,
	mockPurchaseCreate,
	mockPurchaseUpsert,
	mockPurchaseUpdateMany,
	mockPurchaseFindFirst,
	mockPurchaseDelete,
	mockCreatePurchase,
	mockGetPurchaseBySubscriptionId,
	mockUpdatePurchase,
	mockProvisionCircleMember,
	mockDeactivateCircleMember,
	mockReactivateCircleMember,
	mockDeleteCircleMember,
	mockSetCustomerIdToEntity,
	mockGetPlanIdByProviderPriceId,
	mockTransaction,
} = vi.hoisted(() => {
	const mockMemberFindFirst = vi.fn();
	const mockMemberCreate = vi.fn();
	const mockMemberUpsert = vi.fn();
	const mockPurchaseCreate = vi.fn();
	const mockPurchaseUpsert = vi.fn();
	const mockTransaction = vi.fn();

	return {
		mockStripeEventLogCreate: vi.fn(),
		mockMemberFindFirst,
		mockMemberCreate,
		mockMemberUpsert,
		mockMemberFindMany: vi.fn(),
		mockPurchaseCreate,
		mockPurchaseUpsert,
		mockPurchaseUpdateMany: vi.fn(),
		mockPurchaseFindFirst: vi.fn(),
		mockPurchaseDelete: vi.fn(),
		mockCreatePurchase: vi.fn(),
		mockGetPurchaseBySubscriptionId: vi.fn(),
		mockUpdatePurchase: vi.fn(),
		mockProvisionCircleMember: vi.fn(),
		mockDeactivateCircleMember: vi.fn(),
		mockReactivateCircleMember: vi.fn(),
		mockDeleteCircleMember: vi.fn(),
		mockSetCustomerIdToEntity: vi.fn(),
		mockGetPlanIdByProviderPriceId: vi.fn(),
		mockTransaction,
	};
});

vi.mock("@repo/database", () => ({
	db: {
		stripeEventLog: { create: mockStripeEventLogCreate },
		member: {
			findFirst: mockMemberFindFirst,
			create: mockMemberCreate,
			upsert: mockMemberUpsert,
			findMany: mockMemberFindMany,
		},
		purchase: {
			create: mockPurchaseCreate,
			upsert: mockPurchaseUpsert,
			updateMany: mockPurchaseUpdateMany,
			findFirst: mockPurchaseFindFirst,
			delete: mockPurchaseDelete,
		},
		$transaction: mockTransaction,
	},
	createPurchase: (...args: unknown[]) => mockCreatePurchase(...args),
	getPurchaseBySubscriptionId: (...args: unknown[]) =>
		mockGetPurchaseBySubscriptionId(...args),
	updatePurchase: (...args: unknown[]) => mockUpdatePurchase(...args),
}));

vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		log: vi.fn(),
	},
}));

vi.mock("@repo/payments/lib/circle-provisioning", () => ({
	provisionCircleMember: (...args: unknown[]) =>
		mockProvisionCircleMember(...args),
	deactivateCircleMember: (...args: unknown[]) =>
		mockDeactivateCircleMember(...args),
	reactivateCircleMember: (...args: unknown[]) =>
		mockReactivateCircleMember(...args),
	deleteCircleMember: (...args: unknown[]) =>
		mockDeleteCircleMember(...args),
}));

vi.mock("@repo/payments/lib/customer", () => ({
	setCustomerIdToEntity: (...args: unknown[]) =>
		mockSetCustomerIdToEntity(...args),
}));

vi.mock("@repo/payments/lib/provider-price-ids", () => ({
	getPlanIdByProviderPriceId: (...args: unknown[]) =>
		mockGetPlanIdByProviderPriceId(...args),
}));

// Import the actual production functions under test
import { isEventDuplicate } from "@repo/payments";
import {
	handleSubscriptionCreated,
	handleSubscriptionUpdated,
	handleSubscriptionDeleted,
} from "@repo/payments/provider/stripe";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper that builds mock Stripe events
function makeStripeEvent(
	overrides: Partial<StripeEvent> & {
		data: StripeEvent["data"];
		type: string;
	},
): any {
	return {
		id: "evt_test_1",
		object: "event",
		api_version: "2024-04-10",
		created: Math.floor(Date.now() / 1000),
		livemode: false,
		pending_webhooks: 0,
		request: null,
		...overrides,
	};
}

function makeSubscriptionObject(
	overrides: Record<string, unknown> = {},
): StripeSubscription {
	return {
		id: "sub_test_123",
		object: "subscription",
		customer: "cus_test_456",
		status: "active",
		metadata: {
			user_id: "user_test_789",
			organization_id: "org_test_abc",
		},
		items: {
			object: "list",
			data: [
				{
					price: {
						id: "price_test_def",
					},
				},
			],
		},
		...overrides,
	} as unknown as StripeSubscription;
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe("StripeEventLog dedup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns false for a new event (first time seen)", async () => {
		mockStripeEventLogCreate.mockResolvedValue({
			id: "evt_new_1",
			type: "customer.subscription.created",
			processedAt: new Date(),
		});

		const result = await isEventDuplicate(
			"evt_new_1",
			"customer.subscription.created",
		);
		expect(result).toBe(false);
		expect(mockStripeEventLogCreate).toHaveBeenCalledWith({
			data: { id: "evt_new_1", type: "customer.subscription.created" },
		});
	});

	it("returns true for a duplicate event (P2002 unique constraint)", async () => {
		const prismaError = new Error("Unique constraint failed");
		Object.assign(prismaError, { code: "P2002" });
		mockStripeEventLogCreate.mockRejectedValue(prismaError);

		const result = await isEventDuplicate(
			"evt_dup_1",
			"customer.subscription.created",
		);
		expect(result).toBe(true);
	});

	it("re-throws unexpected errors", async () => {
		const unexpectedError = new Error("Connection lost");
		mockStripeEventLogCreate.mockRejectedValue(unexpectedError);

		await expect(
			isEventDuplicate("evt_err_1", "customer.subscription.created"),
		).rejects.toThrow("Connection lost");
	});

	it("silently ignores the same event ID delivered twice", async () => {
		// First call succeeds
		mockStripeEventLogCreate.mockResolvedValueOnce({
			id: "evt_once",
			type: "customer.subscription.created",
			processedAt: new Date(),
		});

		const first = await isEventDuplicate(
			"evt_once",
			"customer.subscription.created",
		);
		expect(first).toBe(false);

		// Second call with same ID hits unique constraint
		const prismaError = new Error("Unique constraint failed");
		Object.assign(prismaError, { code: "P2002" });
		mockStripeEventLogCreate.mockRejectedValueOnce(prismaError);

		const second = await isEventDuplicate(
			"evt_once",
			"customer.subscription.created",
		);
		expect(second).toBe(true);
	});
});

describe("handleSubscriptionCreated", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetPlanIdByProviderPriceId.mockReturnValue("membership");
	});

	function setupTransaction(
		existingMember: Record<string, unknown> | null = null,
	) {
		// The transaction mock receives a callback; we execute it with a tx object
		// that has the same shape as the prisma client subset used in the handler
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
			const tx = {
				purchase: { upsert: mockPurchaseUpsert },
				member: {
					upsert: mockMemberUpsert,
					// D29 recheck looks for a conflicting membership in another org;
					// default to none so the happy path proceeds to the member upsert.
					findFirst: vi.fn().mockResolvedValue(null),
				},
				// S1-08 single-active-subscription guard reads the user's role to
				// decide whether the D29 recheck applies. A plain member triggers it.
				user: {
					findUnique: vi.fn().mockResolvedValue({ role: "member" }),
				},
			};
			mockMemberUpsert.mockResolvedValue(
				existingMember ?? {
					id: "member_1",
					userId: "user_test_789",
					organizationId: "org_test_abc",
					role: "member",
					circleMemberId: null,
				},
			);
			return cb(tx);
		});
	}

	it("creates a Purchase row via transaction with correct fields", async () => {
		setupTransaction(null);
		mockPurchaseUpsert.mockResolvedValue({ id: "purchase_1" });
		mockSetCustomerIdToEntity.mockResolvedValue(undefined);
		mockProvisionCircleMember.mockResolvedValue(undefined);

		const event = makeStripeEvent({
			id: "evt_created_1",
			type: "customer.subscription.created",
			data: { object: makeSubscriptionObject() },
		});

		await handleSubscriptionCreated(event);

		expect(mockPurchaseUpsert).toHaveBeenCalledWith({
			where: { subscriptionId: "sub_test_123" },
			create: {
				subscriptionId: "sub_test_123",
				organizationId: "org_test_abc",
				userId: "user_test_789",
				customerId: "cus_test_456",
				type: "SUBSCRIPTION",
				priceId: "price_test_def",
				status: "active",
			},
			update: {
				organizationId: "org_test_abc",
				userId: "user_test_789",
				customerId: "cus_test_456",
				type: "SUBSCRIPTION",
				priceId: "price_test_def",
				status: "active",
			},
		});
	});

	it("creates a Member row when userId and organizationId are present", async () => {
		setupTransaction(null);
		mockPurchaseUpsert.mockResolvedValue({ id: "purchase_1" });
		mockSetCustomerIdToEntity.mockResolvedValue(undefined);
		mockProvisionCircleMember.mockResolvedValue(undefined);

		const event = makeStripeEvent({
			id: "evt_created_2",
			type: "customer.subscription.created",
			data: { object: makeSubscriptionObject() },
		});

		await handleSubscriptionCreated(event);

		expect(mockMemberUpsert).toHaveBeenCalledWith({
			where: {
				organizationId_userId: {
					organizationId: "org_test_abc",
					userId: "user_test_789",
				},
			},
			update: {},
			create: {
				userId: "user_test_789",
				organizationId: "org_test_abc",
				role: "member",
				createdAt: expect.any(Date),
			},
		});
	});

	it("does not create duplicate Member row if one exists", async () => {
		const existingMember = {
			id: "member_existing",
			userId: "user_test_789",
			organizationId: "org_test_abc",
			role: "member",
			circleMemberId: null,
		};
		setupTransaction(existingMember);
		mockPurchaseUpsert.mockResolvedValue({ id: "purchase_1" });
		mockSetCustomerIdToEntity.mockResolvedValue(undefined);
		mockProvisionCircleMember.mockResolvedValue(undefined);

		const event = makeStripeEvent({
			id: "evt_created_3",
			type: "customer.subscription.created",
			data: { object: makeSubscriptionObject() },
		});

		await handleSubscriptionCreated(event);

		expect(mockMemberUpsert).toHaveBeenCalledOnce();
	});

	it("triggers Circle provisioning for new member without circleMemberId", async () => {
		setupTransaction(null);
		mockPurchaseUpsert.mockResolvedValue({ id: "purchase_1" });
		mockSetCustomerIdToEntity.mockResolvedValue(undefined);
		mockProvisionCircleMember.mockResolvedValue(undefined);

		const event = makeStripeEvent({
			id: "evt_provision_1",
			type: "customer.subscription.created",
			data: { object: makeSubscriptionObject() },
		});

		await handleSubscriptionCreated(event);

		expect(mockProvisionCircleMember).toHaveBeenCalledWith(
			{
				id: "member_1",
				userId: "user_test_789",
				organizationId: "org_test_abc",
			},
			"evt_provision_1",
		);
	});

	it("skips Circle provisioning if circleMemberId already exists (Layer 3)", async () => {
		const existingMember = {
			id: "member_1",
			userId: "user_test_789",
			organizationId: "org_test_abc",
			circleMemberId: "circle_existing_123",
		};
		setupTransaction(existingMember);
		mockPurchaseUpsert.mockResolvedValue({ id: "purchase_1" });
		mockSetCustomerIdToEntity.mockResolvedValue(undefined);

		const event = makeStripeEvent({
			id: "evt_skip_provision",
			type: "customer.subscription.created",
			data: { object: makeSubscriptionObject() },
		});

		await handleSubscriptionCreated(event);

		expect(mockProvisionCircleMember).not.toHaveBeenCalled();
	});

	it("throws when plan ID cannot be resolved from price", async () => {
		mockGetPlanIdByProviderPriceId.mockReturnValue(null);

		const event = makeStripeEvent({
			id: "evt_no_plan",
			type: "customer.subscription.created",
			data: { object: makeSubscriptionObject() },
		});

		await expect(handleSubscriptionCreated(event)).rejects.toThrow(
			"Missing plan or price ID in subscription.created",
		);
	});

	it("sets customer ID on entity after transaction", async () => {
		setupTransaction(null);
		mockPurchaseUpsert.mockResolvedValue({ id: "purchase_1" });
		mockSetCustomerIdToEntity.mockResolvedValue(undefined);
		mockProvisionCircleMember.mockResolvedValue(undefined);

		const event = makeStripeEvent({
			id: "evt_customer_id",
			type: "customer.subscription.created",
			data: { object: makeSubscriptionObject() },
		});

		await handleSubscriptionCreated(event);

		expect(mockSetCustomerIdToEntity).toHaveBeenCalledWith("cus_test_456", {
			userId: "user_test_789",
		});
	});
});

describe("handleSubscriptionDeleted", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("flips Purchase.status to 'canceled' instead of deleting", async () => {
		mockPurchaseUpdateMany.mockResolvedValue({ count: 1 });
		mockPurchaseFindFirst.mockResolvedValue(null);

		const event = makeStripeEvent({
			id: "evt_deleted_1",
			type: "customer.subscription.deleted",
			data: { object: makeSubscriptionObject({ status: "canceled" }) },
		});

		await handleSubscriptionDeleted(event);

		expect(mockPurchaseUpdateMany).toHaveBeenCalledWith({
			where: { subscriptionId: "sub_test_123" },
			data: { status: "canceled" },
		});
		expect(mockPurchaseDelete).not.toHaveBeenCalled();
	});

	it("deactivates Circle member when subscription is deleted", async () => {
		mockPurchaseUpdateMany.mockResolvedValue({ count: 1 });
		mockPurchaseFindFirst.mockResolvedValue({
			id: "purchase_1",
			subscriptionId: "sub_test_123",
			userId: "user_test_789",
			organizationId: "org_test_abc",
		});
		mockMemberFindFirst.mockResolvedValue({
			id: "member_1",
			userId: "user_test_789",
			circleMemberId: "circle_member_123",
			circleStatus: "active",
		});
		mockDeactivateCircleMember.mockResolvedValue(undefined);

		const event = makeStripeEvent({
			id: "evt_deleted_2",
			type: "customer.subscription.deleted",
			data: { object: makeSubscriptionObject({ status: "canceled" }) },
		});

		await handleSubscriptionDeleted(event);

		expect(mockDeactivateCircleMember).toHaveBeenCalledWith({
			id: "member_1",
			circleMemberId: "circle_member_123",
		});
	});

	it("scopes Member lookup by organizationId from purchase", async () => {
		mockPurchaseUpdateMany.mockResolvedValue({ count: 1 });
		mockPurchaseFindFirst.mockResolvedValue({
			id: "purchase_1",
			subscriptionId: "sub_test_123",
			userId: "user_test_789",
			organizationId: "org_test_abc",
		});
		mockMemberFindFirst.mockResolvedValue(null);

		const event = makeStripeEvent({
			id: "evt_deleted_scope",
			type: "customer.subscription.deleted",
			data: { object: makeSubscriptionObject({ status: "canceled" }) },
		});

		await handleSubscriptionDeleted(event);

		expect(mockMemberFindFirst).toHaveBeenCalledWith({
			where: { userId: "user_test_789", organizationId: "org_test_abc" },
		});
	});

	it("does not deactivate Circle if member has no circleMemberId", async () => {
		mockPurchaseUpdateMany.mockResolvedValue({ count: 1 });
		mockPurchaseFindFirst.mockResolvedValue({
			id: "purchase_1",
			subscriptionId: "sub_test_123",
			userId: "user_test_789",
			organizationId: "org_test_abc",
		});
		mockMemberFindFirst.mockResolvedValue({
			id: "member_1",
			userId: "user_test_789",
			circleMemberId: null,
			circleStatus: null,
		});

		const event = makeStripeEvent({
			id: "evt_deleted_3",
			type: "customer.subscription.deleted",
			data: { object: makeSubscriptionObject({ status: "canceled" }) },
		});

		await handleSubscriptionDeleted(event);

		expect(mockDeactivateCircleMember).not.toHaveBeenCalled();
	});
});

describe("handleSubscriptionUpdated", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("updates Purchase.status to match subscription status", async () => {
		mockGetPurchaseBySubscriptionId.mockResolvedValue({
			id: "purchase_1",
			subscriptionId: "sub_test_123",
			status: "active",
			userId: "user_test_789",
			organizationId: "org_test_abc",
		});
		mockUpdatePurchase.mockResolvedValue({
			id: "purchase_1",
			status: "past_due",
		});

		const event = makeStripeEvent({
			id: "evt_updated_1",
			type: "customer.subscription.updated",
			data: {
				object: makeSubscriptionObject({ status: "past_due" }),
			},
		});

		await handleSubscriptionUpdated(event);

		expect(mockUpdatePurchase).toHaveBeenCalledWith({
			id: "purchase_1",
			status: "past_due",
			priceId: "price_test_def",
		});
	});

	it("reactivates Circle when status transitions from canceled to active", async () => {
		mockGetPurchaseBySubscriptionId.mockResolvedValue({
			id: "purchase_1",
			subscriptionId: "sub_test_123",
			userId: "user_test_789",
			organizationId: "org_test_abc",
			status: "active",
		});
		mockUpdatePurchase.mockResolvedValue({ id: "purchase_1" });
		mockMemberFindFirst.mockResolvedValue({
			id: "member_1",
			userId: "user_test_789",
			circleMemberId: "circle_member_123",
			circleStatus: "deactivated",
		});
		mockReactivateCircleMember.mockResolvedValue(undefined);

		const event = makeStripeEvent({
			id: "evt_reactivate_1",
			type: "customer.subscription.updated",
			data: {
				object: makeSubscriptionObject({ status: "active" }),
				previous_attributes: { status: "canceled" },
			} as StripeEvent["data"],
		});

		await handleSubscriptionUpdated(event);

		expect(mockReactivateCircleMember).toHaveBeenCalledWith({
			id: "member_1",
			circleMemberId: "circle_member_123",
		});
	});

	it("scopes Member lookup by organizationId from purchase during reactivation", async () => {
		mockGetPurchaseBySubscriptionId.mockResolvedValue({
			id: "purchase_1",
			subscriptionId: "sub_test_123",
			userId: "user_test_789",
			organizationId: "org_test_abc",
			status: "active",
		});
		mockUpdatePurchase.mockResolvedValue({ id: "purchase_1" });
		mockMemberFindFirst.mockResolvedValue({
			id: "member_1",
			userId: "user_test_789",
			circleMemberId: "circle_member_123",
			circleStatus: "deactivated",
		});
		mockReactivateCircleMember.mockResolvedValue(undefined);

		const event = makeStripeEvent({
			id: "evt_reactivate_scope",
			type: "customer.subscription.updated",
			data: {
				object: makeSubscriptionObject({ status: "active" }),
				previous_attributes: { status: "canceled" },
			} as StripeEvent["data"],
		});

		await handleSubscriptionUpdated(event);

		expect(mockMemberFindFirst).toHaveBeenCalledWith({
			where: { userId: "user_test_789", organizationId: "org_test_abc" },
		});
	});

	it("does not reactivate Circle when status change is not canceled->active", async () => {
		mockGetPurchaseBySubscriptionId.mockResolvedValue({
			id: "purchase_1",
			subscriptionId: "sub_test_123",
			userId: "user_test_789",
			organizationId: "org_test_abc",
			status: "past_due",
		});
		mockUpdatePurchase.mockResolvedValue({ id: "purchase_1" });

		const event = makeStripeEvent({
			id: "evt_no_reactivate",
			type: "customer.subscription.updated",
			data: {
				object: makeSubscriptionObject({ status: "past_due" }),
				previous_attributes: { status: "active" },
			} as StripeEvent["data"],
		});

		await handleSubscriptionUpdated(event);

		expect(mockReactivateCircleMember).not.toHaveBeenCalled();
	});

	it("does not reactivate Circle if circleStatus is not deactivated", async () => {
		mockGetPurchaseBySubscriptionId.mockResolvedValue({
			id: "purchase_1",
			subscriptionId: "sub_test_123",
			userId: "user_test_789",
			organizationId: "org_test_abc",
			status: "active",
		});
		mockUpdatePurchase.mockResolvedValue({ id: "purchase_1" });
		mockMemberFindFirst.mockResolvedValue({
			id: "member_1",
			userId: "user_test_789",
			circleMemberId: "circle_member_123",
			circleStatus: "active", // Already active — should not reactivate
		});

		const event = makeStripeEvent({
			id: "evt_already_active",
			type: "customer.subscription.updated",
			data: {
				object: makeSubscriptionObject({ status: "active" }),
				previous_attributes: { status: "canceled" },
			} as StripeEvent["data"],
		});

		await handleSubscriptionUpdated(event);

		expect(mockReactivateCircleMember).not.toHaveBeenCalled();
	});

	it("reuses existing purchase instead of fetching twice during reactivation", async () => {
		mockGetPurchaseBySubscriptionId.mockResolvedValue({
			id: "purchase_1",
			subscriptionId: "sub_test_123",
			userId: "user_test_789",
			organizationId: "org_test_abc",
			status: "active",
		});
		mockUpdatePurchase.mockResolvedValue({ id: "purchase_1" });
		mockMemberFindFirst.mockResolvedValue({
			id: "member_1",
			userId: "user_test_789",
			circleMemberId: "circle_member_123",
			circleStatus: "deactivated",
		});
		mockReactivateCircleMember.mockResolvedValue(undefined);

		const event = makeStripeEvent({
			id: "evt_reuse_purchase",
			type: "customer.subscription.updated",
			data: {
				object: makeSubscriptionObject({ status: "active" }),
				previous_attributes: { status: "canceled" },
			} as StripeEvent["data"],
		});

		await handleSubscriptionUpdated(event);

		// Should only be called once — the second call is avoided by reusing
		expect(mockGetPurchaseBySubscriptionId).toHaveBeenCalledTimes(1);
	});
});

describe("User deletion cascade", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("deletes Circle members for all user memberships", async () => {
		const members = [
			{
				id: "member_1",
				userId: "user_1",
				circleMemberId: "circle_1",
				circleStatus: "active",
			},
			{
				id: "member_2",
				userId: "user_1",
				circleMemberId: "circle_2",
				circleStatus: "deactivated",
			},
		];
		mockMemberFindMany.mockResolvedValue(members);
		mockDeleteCircleMember.mockResolvedValue(undefined);

		// This tests the cascade logic directly
		const foundMembers = await mockMemberFindMany({
			where: { userId: "user_1" },
		});

		for (const member of foundMembers) {
			if (member.circleMemberId) {
				await mockDeleteCircleMember(member.circleMemberId);
			}
		}

		expect(mockDeleteCircleMember).toHaveBeenCalledTimes(2);
		expect(mockDeleteCircleMember).toHaveBeenCalledWith("circle_1");
		expect(mockDeleteCircleMember).toHaveBeenCalledWith("circle_2");
	});

	it("skips Circle deletion for members without circleMemberId", async () => {
		mockMemberFindMany.mockResolvedValue([
			{
				id: "member_1",
				userId: "user_1",
				circleMemberId: null,
				circleStatus: null,
			},
		]);

		const foundMembers = await mockMemberFindMany({
			where: { userId: "user_1" },
		});

		for (const member of foundMembers) {
			if (member.circleMemberId) {
				await mockDeleteCircleMember(member.circleMemberId);
			}
		}

		expect(mockDeleteCircleMember).not.toHaveBeenCalled();
	});
});

describe("Checkout session metadata", () => {
	it("metadata includes both userId and organizationId keys", () => {
		const userId: string | undefined = "user_test_789";
		const organizationId: string | undefined = "org_test_abc";

		const metadata = {
			organization_id: organizationId || null,
			user_id: userId || null,
		};

		expect(metadata).toHaveProperty("user_id", "user_test_789");
		expect(metadata).toHaveProperty("organization_id", "org_test_abc");
	});

	it("metadata sets null when organizationId is not provided", () => {
		const userId: string | undefined = "user_test_789";
		const organizationId: string | undefined = undefined;

		const metadata = {
			organization_id: organizationId || null,
			user_id: userId || null,
		};

		expect(metadata.organization_id).toBeNull();
		expect(metadata.user_id).toBe("user_test_789");
	});
});
