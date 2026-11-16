/**
 * S17-02 (W-08): a claim left behind by a killed function must not swallow
 * Stripe's retry forever. Only a completed event, or a claim younger than
 * 5 minutes, counts as a duplicate.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockUpdateMany } = vi.hoisted(() => ({
	mockCreate: vi.fn(),
	mockUpdateMany: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: { stripeEventLog: { create: mockCreate, updateMany: mockUpdateMany } },
}));

import { isEventDuplicate, markEventCompleted } from "../stripe-dedup";

const uniqueViolation = Object.assign(new Error("unique"), { code: "P2002" });

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-11-16T12:00:00.000Z"));
});

describe("isEventDuplicate", () => {
	it("claims a new event", async () => {
		mockCreate.mockResolvedValue({});
		expect(await isEventDuplicate("evt_1", "customer.subscription.created")).toBe(false);
		expect(mockUpdateMany).not.toHaveBeenCalled();
	});

	it("re-claims an incomplete claim older than 5 minutes", async () => {
		mockCreate.mockRejectedValue(uniqueViolation);
		mockUpdateMany.mockResolvedValue({ count: 1 });

		expect(await isEventDuplicate("evt_1", "customer.subscription.created")).toBe(false);
		expect(mockUpdateMany).toHaveBeenCalledWith({
			where: {
				id: "evt_1",
				completedAt: null,
				processedAt: { lt: new Date("2026-11-16T11:55:00.000Z") },
			},
			data: { processedAt: new Date("2026-11-16T12:00:00.000Z") },
		});
	});

	it("skips a completed event or a fresh claim", async () => {
		mockCreate.mockRejectedValue(uniqueViolation);
		mockUpdateMany.mockResolvedValue({ count: 0 });
		expect(await isEventDuplicate("evt_1", "customer.subscription.created")).toBe(true);
	});

	it("rethrows unexpected errors", async () => {
		mockCreate.mockRejectedValue(new Error("db down"));
		await expect(isEventDuplicate("evt_1", "x")).rejects.toThrow("db down");
	});
});

describe("markEventCompleted", () => {
	it("stamps completedAt", async () => {
		mockUpdateMany.mockResolvedValue({ count: 1 });
		await markEventCompleted("evt_1");
		expect(mockUpdateMany).toHaveBeenCalledWith({
			where: { id: "evt_1" },
			data: { completedAt: new Date("2026-11-16T12:00:00.000Z") },
		});
	});
});
