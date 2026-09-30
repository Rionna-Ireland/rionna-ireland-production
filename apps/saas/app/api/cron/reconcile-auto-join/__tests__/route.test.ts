/**
 * S12-02b Task 6: reconcile-auto-join cron route tests.
 *
 * Cases:
 *   1. Missing / wrong bearer → 401, pass never called
 *   2. Correct bearer → 200 with { ok: true, summary: { autoJoin } }, completion log fires
 *   3. Pass throws → route propagates (Next default 500)
 *   4. GET is aliased to POST (native Vercel Cron)
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockReconcileAutoJoinMemberships, mockLoggerInfo } = vi.hoisted(() => ({
	mockReconcileAutoJoinMemberships: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/api/modules/community/lib/reconcile-auto-join", () => ({
	reconcileAutoJoinMemberships: mockReconcileAutoJoinMemberships,
}));

vi.mock("@repo/logs", () => ({
	logger: {
		info: mockLoggerInfo,
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Import after mocks are registered.
import { GET, POST } from "../route";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

const AUTO_JOIN_SUMMARY = {
	orgs: 1,
	members: 10,
	joined: 8,
	skipped: 2,
	errors: 0,
};

const URL = "http://localhost/api/cron/reconcile-auto-join";

describe("/api/cron/reconcile-auto-join", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.CRON_SECRET = "test-secret";
	});

	afterAll(() => {
		process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
	});

	it("returns 401 when authorization header is missing", async () => {
		const response = await POST(new Request(URL, { method: "POST" }));

		expect(response.status).toBe(401);
		expect(mockReconcileAutoJoinMemberships).not.toHaveBeenCalled();
	});

	it("returns 401 when bearer token is wrong", async () => {
		const response = await POST(
			new Request(URL, { method: "POST", headers: { authorization: "Bearer nope" } }),
		);

		expect(response.status).toBe(401);
		expect(mockReconcileAutoJoinMemberships).not.toHaveBeenCalled();
	});

	it("runs the auto-join pass and returns its summary with the correct bearer", async () => {
		mockReconcileAutoJoinMemberships.mockResolvedValueOnce(AUTO_JOIN_SUMMARY);

		const response = await POST(
			new Request(URL, { method: "POST", headers: { authorization: "Bearer test-secret" } }),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			summary: { autoJoin: AUTO_JOIN_SUMMARY },
		});
		expect(mockReconcileAutoJoinMemberships).toHaveBeenCalledTimes(1);
		expect(mockLoggerInfo).toHaveBeenCalledWith(
			"community.auto_join.reconcile.cron.complete",
			AUTO_JOIN_SUMMARY,
		);
	});

	it("propagates errors when the auto-join reconcile throws", async () => {
		mockReconcileAutoJoinMemberships.mockRejectedValueOnce(new Error("boom"));

		await expect(
			POST(
				new Request(URL, {
					method: "POST",
					headers: { authorization: "Bearer test-secret" },
				}),
			),
		).rejects.toThrow("boom");
	});

	it("aliases GET to POST — Vercel Cron invokes with GET", () => {
		expect(GET).toBe(POST);
	});
});
