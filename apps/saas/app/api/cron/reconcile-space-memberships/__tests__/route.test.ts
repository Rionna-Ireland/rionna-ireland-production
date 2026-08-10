/**
 * S8-04 §3: reconcile-space-memberships cron route tests.
 *
 * Cases:
 *   1. Missing authorization header → 401, reconcile not called
 *   2. Wrong bearer token → 401, reconcile not called
 *   3. Correct bearer → 200 with { ok: true, summary }; reconcile called
 *      exactly once with no args; space_membership.reconcile.cron.complete logged
 *   4. Reconcile throws → route propagates (Next default 500)
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockReconcileSpaceMemberships, mockLoggerInfo } = vi.hoisted(() => ({
	mockReconcileSpaceMemberships: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/api/modules/racing/horses/lib/reconcile-space-memberships", () => ({
	reconcileSpaceMemberships: mockReconcileSpaceMemberships,
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

describe("POST /api/cron/reconcile-space-memberships", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.CRON_SECRET = "test-secret";
	});

	afterAll(() => {
		process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
	});

	it("returns 401 when authorization header is missing", async () => {
		const request = new Request("http://localhost/api/cron/reconcile-space-memberships", {
			method: "POST",
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(mockReconcileSpaceMemberships).not.toHaveBeenCalled();
	});

	it("returns 401 when bearer token is wrong", async () => {
		const request = new Request("http://localhost/api/cron/reconcile-space-memberships", {
			method: "POST",
			headers: { authorization: "Bearer nope" },
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(mockReconcileSpaceMemberships).not.toHaveBeenCalled();
	});

	it("runs the reconcile and returns a summary with the correct bearer", async () => {
		const summary = {
			orgsProcessed: 1,
			orgsSkippedDisabled: 0,
			totalFollows: 42,
			joined: 40,
			failed: 2,
		};
		mockReconcileSpaceMemberships.mockResolvedValueOnce(summary);

		const request = new Request("http://localhost/api/cron/reconcile-space-memberships", {
			method: "POST",
			headers: { authorization: "Bearer test-secret" },
		});

		const response = await POST(request);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, summary });

		expect(mockReconcileSpaceMemberships).toHaveBeenCalledTimes(1);
		expect(mockReconcileSpaceMemberships).toHaveBeenCalledWith();

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			"space_membership.reconcile.cron.complete",
			summary,
		);
	});

	it("propagates errors when reconcile throws", async () => {
		mockReconcileSpaceMemberships.mockRejectedValueOnce(new Error("boom"));

		const request = new Request("http://localhost/api/cron/reconcile-space-memberships", {
			method: "POST",
			headers: { authorization: "Bearer test-secret" },
		});

		await expect(POST(request)).rejects.toThrow("boom");
		expect(mockLoggerInfo).not.toHaveBeenCalledWith(
			"space_membership.reconcile.cron.complete",
			expect.anything(),
		);
	});
});
