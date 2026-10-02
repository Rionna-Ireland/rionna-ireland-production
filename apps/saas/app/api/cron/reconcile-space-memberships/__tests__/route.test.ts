/**
 * S8-04 §3: reconcile-space-memberships cron route tests. (The S12-02b
 * auto-join pass moved to /api/cron/reconcile-auto-join.)
 *
 * Cases:
 *   1. Missing authorization header → 401, reconcile not called
 *   2. Wrong bearer token → 401, reconcile not called
 *   3. Correct bearer → 200 with { ok: true, summary: { horseSpaceMemberships } };
 *      called exactly once with no args; completion log fires; auto-join never runs here
 *   4. Horse-space reconcile throws → route propagates (Next default 500)
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockReconcileSpaceMemberships, mockReconcileAutoJoinMemberships, mockLoggerInfo } = vi.hoisted(() => ({
	mockReconcileSpaceMemberships: vi.fn(),
	mockReconcileAutoJoinMemberships: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/api/modules/racing/horses/lib/reconcile-space-memberships", () => ({
	reconcileSpaceMemberships: mockReconcileSpaceMemberships,
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

const HORSE_SPACE_SUMMARY = {
	orgsProcessed: 1,
	orgsSkippedDisabled: 0,
	totalFollows: 42,
	skipped: 3,
	joined: 37,
	failed: 2,
	visibilityFixed: 0,
};

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
		expect(mockReconcileAutoJoinMemberships).not.toHaveBeenCalled();
	});

	it("returns 401 when bearer token is wrong", async () => {
		const request = new Request("http://localhost/api/cron/reconcile-space-memberships", {
			method: "POST",
			headers: { authorization: "Bearer nope" },
		});

		const response = await POST(request);

		expect(response.status).toBe(401);
		expect(mockReconcileSpaceMemberships).not.toHaveBeenCalled();
		expect(mockReconcileAutoJoinMemberships).not.toHaveBeenCalled();
	});

	it("runs the horse-space reconcile only and returns its summary with the correct bearer", async () => {
		mockReconcileSpaceMemberships.mockResolvedValueOnce(HORSE_SPACE_SUMMARY);

		const request = new Request("http://localhost/api/cron/reconcile-space-memberships", {
			method: "POST",
			headers: { authorization: "Bearer test-secret" },
		});

		const response = await POST(request);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			summary: { horseSpaceMemberships: HORSE_SPACE_SUMMARY },
		});

		expect(mockReconcileSpaceMemberships).toHaveBeenCalledTimes(1);
		expect(mockReconcileSpaceMemberships).toHaveBeenCalledWith();
		expect(mockReconcileAutoJoinMemberships).not.toHaveBeenCalled();

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			"space_membership.reconcile.cron.complete",
			HORSE_SPACE_SUMMARY,
		);
	});

	it("propagates errors when the horse-space reconcile throws", async () => {
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

describe("GET /api/cron/reconcile-space-memberships (native Vercel Cron)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.CRON_SECRET = "test-secret";
	});

	afterAll(() => {
		process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
	});

	it("is aliased to the same handler as POST — Vercel Cron invokes with GET", () => {
		expect(GET).toBe(POST);
	});

	it("returns 401 when authorization header is missing", async () => {
		const request = new Request("http://localhost/api/cron/reconcile-space-memberships", {
			method: "GET",
		});

		const response = await GET(request);

		expect(response.status).toBe(401);
		expect(mockReconcileSpaceMemberships).not.toHaveBeenCalled();
	});

	it("runs the horse-space reconcile with the correct bearer, mirroring Vercel Cron's Authorization header", async () => {
		mockReconcileSpaceMemberships.mockResolvedValueOnce(HORSE_SPACE_SUMMARY);

		const request = new Request("http://localhost/api/cron/reconcile-space-memberships", {
			method: "GET",
			headers: { authorization: "Bearer test-secret" },
		});

		const response = await GET(request);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			summary: { horseSpaceMemberships: HORSE_SPACE_SUMMARY },
		});
		expect(mockReconcileSpaceMemberships).toHaveBeenCalledTimes(1);
		expect(mockReconcileAutoJoinMemberships).not.toHaveBeenCalled();
	});
});
