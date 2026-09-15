/**
 * S12-06 / Task 9: inbox-retention cron route tests.
 *
 * Cases:
 *   1. Missing authorization header → 401, retention not called
 *   2. Wrong bearer token → 401, retention not called
 *   3. Correct bearer → 200 with { ok: true, deleted, batches };
 *      retention called exactly once with no args;
 *      inbox.retention.complete logged
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDeleteExpiredInboxItems, mockLoggerInfo } = vi.hoisted(() => ({
	mockDeleteExpiredInboxItems: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/api/modules/inbox/retention", () => ({
	deleteExpiredInboxItems: mockDeleteExpiredInboxItems,
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

describe("POST /api/cron/inbox-retention", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.CRON_SECRET = "test-secret";
	});

	afterAll(() => {
		process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
	});

	it("returns 401 when authorization header is missing", async () => {
		const request = new Request("http://localhost/api/cron/inbox-retention", {
			method: "POST",
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(mockDeleteExpiredInboxItems).not.toHaveBeenCalled();
	});

	it("returns 401 when bearer token is wrong", async () => {
		const request = new Request("http://localhost/api/cron/inbox-retention", {
			method: "POST",
			headers: { authorization: "Bearer nope" },
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(mockDeleteExpiredInboxItems).not.toHaveBeenCalled();
	});

	it("runs retention and returns the result with the correct bearer", async () => {
		const result = { deleted: 12, batches: 1 };
		mockDeleteExpiredInboxItems.mockResolvedValueOnce(result);

		const request = new Request("http://localhost/api/cron/inbox-retention", {
			method: "POST",
			headers: { authorization: "Bearer test-secret" },
		});

		const response = await POST(request);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, ...result });

		expect(mockDeleteExpiredInboxItems).toHaveBeenCalledTimes(1);
		expect(mockDeleteExpiredInboxItems).toHaveBeenCalledWith();

		expect(mockLoggerInfo).toHaveBeenCalledWith("inbox.retention.complete", result);
	});
});
