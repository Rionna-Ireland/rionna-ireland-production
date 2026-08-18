/**
 * S6-01 / T12: Circle-poll cron route tests.
 *
 * Cases:
 *   1. Missing authorization header → 401, poller not called
 *   2. Wrong bearer token → 401, poller not called
 *   3. Correct bearer → 200 with { ok: true, metrics }; poller called
 *      exactly once with no args; circle.poll.cron.complete logged
 *   4. Poller throws → route propagates (Next default 500)
 */

import type { PollTickMetrics } from "@repo/api/modules/circle/poller";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunCirclePollTick, mockLoggerInfo } = vi.hoisted(() => ({
	mockRunCirclePollTick: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/api/modules/circle/poller", () => ({
	runCirclePollTick: mockRunCirclePollTick,
}));

vi.mock("@repo/logs", () => ({
	logger: {
		info: mockLoggerInfo,
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Import after mocks are registered.
import { POST } from "../route";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("POST /api/cron/circle-poll", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.CRON_SECRET = "test-secret";
	});

	afterAll(() => {
		process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
	});

	it("returns 401 when authorization header is missing", async () => {
		const request = new Request("http://localhost/api/cron/circle-poll", {
			method: "POST",
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(mockRunCirclePollTick).not.toHaveBeenCalled();
	});

	it("returns 401 when bearer token is wrong", async () => {
		const request = new Request("http://localhost/api/cron/circle-poll", {
			method: "POST",
			headers: { authorization: "Bearer nope" },
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(mockRunCirclePollTick).not.toHaveBeenCalled();
	});

	it("runs the poller and returns metrics with the correct bearer", async () => {
		const metrics = {
			tickMs: 1_234,
			organizationsScanned: 2,
			membersEligible: 14,
			membersDue: 12,
			membersPolled: 14,
			notificationsFetched: 8,
			pushesSent: 5,
			pushesSuppressedByPolicy: 2,
			baselined: 1,
			driftDetected: 0,
			cursorWrites: 6,
			heartbeatWrites: 3,
			leaseAcquired: 2,
			leaseCollisions: 0,
			coordinationErrors: 0,
			requestBudgetUsed: 14,
			budgetWouldDefer: 0,
			deferredByBudget: 0,
			deferredByBackoff: 0,
			rateLimited: 0,
			timedOut: 0,
			safetyModes: ["enforce"],
			deliveryProfiles: ["personalized_only"],
			cadenceMinutes: [15],
			requestBudgets: [700],
			errors: 0,
		} satisfies PollTickMetrics;
		mockRunCirclePollTick.mockResolvedValueOnce(metrics);

		const request = new Request("http://localhost/api/cron/circle-poll", {
			method: "POST",
			headers: { authorization: "Bearer test-secret" },
		});

		const response = await POST(request);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, metrics });

		expect(mockRunCirclePollTick).toHaveBeenCalledTimes(1);
		expect(mockRunCirclePollTick).toHaveBeenCalledWith();

		expect(mockLoggerInfo).toHaveBeenCalledWith("circle.poll.cron.complete", metrics);
	});

	it("propagates errors when the poller throws", async () => {
		mockRunCirclePollTick.mockRejectedValueOnce(new Error("boom"));

		const request = new Request("http://localhost/api/cron/circle-poll", {
			method: "POST",
			headers: { authorization: "Bearer test-secret" },
		});

		await expect(POST(request)).rejects.toThrow("boom");
		expect(mockLoggerInfo).not.toHaveBeenCalledWith(
			"circle.poll.cron.complete",
			expect.anything(),
		);
	});
});
