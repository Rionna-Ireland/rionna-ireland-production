/**
 * Stripe webhook dedup-claim release (FABLE_AUDIT C3)
 *
 * The event is claimed in StripeEventLog before processing. The
 * checkout.session.completed path can exit with a 400 *without throwing*
 * (missing plan/price id) — if that path doesn't release the claim,
 * Stripe's retries hit the dedup, get a 200, and the purchase is silently
 * never created. Non-2xx early returns must clear the claim so a retry
 * can reprocess the event.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockConstructEvent,
	mockSessionsRetrieve,
	mockIsDuplicate,
	mockClearDedup,
	mockGetPlanId,
	mockCreatePurchase,
	mockSetCustomerId,
	mockLogger,
} = vi.hoisted(() => ({
	mockConstructEvent: vi.fn(),
	mockSessionsRetrieve: vi.fn(),
	mockIsDuplicate: vi.fn(),
	mockClearDedup: vi.fn(),
	mockGetPlanId: vi.fn(),
	mockCreatePurchase: vi.fn(),
	mockSetCustomerId: vi.fn(),
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("stripe", () => ({
	default: class StripeMock {
		webhooks = { constructEventAsync: mockConstructEvent };
		checkout = { sessions: { retrieve: mockSessionsRetrieve } };
	},
}));

vi.mock("@repo/logs", () => ({ logger: mockLogger }));

vi.mock("@repo/database", () => ({
	createPurchase: mockCreatePurchase,
	db: {},
	getPurchaseBySubscriptionId: vi.fn(),
	updatePurchase: vi.fn(),
}));

vi.mock("../../../lib/stripe-dedup", () => ({
	isEventDuplicate: mockIsDuplicate,
	clearEventDedup: mockClearDedup,
}));

vi.mock("../../../lib/provider-price-ids", () => ({
	getPlanIdByProviderPriceId: mockGetPlanId,
}));

vi.mock("../../../lib/circle-provisioning", () => ({
	deactivateCircleMember: vi.fn(),
	provisionCircleMember: vi.fn(),
	reactivateCircleMember: vi.fn(),
}));

vi.mock("../../../lib/send-welcome-email", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("../../../lib/customer", () => ({ setCustomerIdToEntity: mockSetCustomerId }));

import { webhookHandler } from "../index";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";

function makeReq() {
	return new Request("https://example.test/webhooks/payments", {
		method: "POST",
		body: JSON.stringify({}),
		headers: { "stripe-signature": "sig" },
	});
}

function checkoutCompletedEvent() {
	return {
		id: "evt_1",
		type: "checkout.session.completed",
		data: {
			object: {
				id: "cs_1",
				mode: "payment",
				metadata: { user_id: "u1" },
				customer: "cus_1",
			},
		},
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockIsDuplicate.mockResolvedValue(false);
	mockClearDedup.mockResolvedValue(undefined);
});

describe("webhookHandler dedup-claim release (C3)", () => {
	it("releases the claim when checkout.session.completed exits 400 on a missing plan/price", async () => {
		mockConstructEvent.mockResolvedValue(checkoutCompletedEvent());
		// Session has no resolvable price → the handler's 400 early return.
		mockSessionsRetrieve.mockResolvedValue({ line_items: { data: [{ price: null }] } });

		const res = await webhookHandler(makeReq());

		expect(res.status).toBe(400);
		expect(mockClearDedup).toHaveBeenCalledWith("evt_1");
	});

	it("keeps the claim when the purchase is created successfully", async () => {
		mockConstructEvent.mockResolvedValue(checkoutCompletedEvent());
		mockSessionsRetrieve.mockResolvedValue({
			line_items: { data: [{ price: { id: "price_1" } }] },
		});
		mockGetPlanId.mockReturnValue("plan_1");
		mockCreatePurchase.mockResolvedValue({ id: "p1" });
		mockSetCustomerId.mockResolvedValue(undefined);

		const res = await webhookHandler(makeReq());

		expect(res.status).toBe(204);
		expect(mockClearDedup).not.toHaveBeenCalled();
	});

	it("still releases the claim when processing throws (existing behavior)", async () => {
		mockConstructEvent.mockResolvedValue(checkoutCompletedEvent());
		mockSessionsRetrieve.mockRejectedValue(new Error("stripe down"));

		const res = await webhookHandler(makeReq());

		expect(res.status).toBe(500);
		expect(mockClearDedup).toHaveBeenCalledWith("evt_1");
	});
});
