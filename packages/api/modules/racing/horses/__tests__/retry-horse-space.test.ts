/**
 * retryHorseSpaceProvisioning tests (S2-09 surface F)
 *
 * Admin-triggered retry for a horse whose Circle space provisioning failed.
 * Re-runs the fail-safe provisioning fn and returns the refreshed horse; a horse
 * that already has a space is returned untouched.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetHorseById, mockProvisionHorseSpace } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetHorseById: vi.fn(),
	mockProvisionHorseSpace: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({ getHorseById: mockGetHorseById }));

vi.mock("@repo/payments/lib/circle-horse-provisioning", () => ({
	provisionHorseSpace: mockProvisionHorseSpace,
}));

import { retryHorseSpaceProvisioning } from "../procedures/retry-horse-space-provisioning";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockProvisionHorseSpace.mockResolvedValue({ ok: true });
});

describe("retryHorseSpaceProvisioning (S2-09)", () => {
	it("retries provisioning for a horse with a failed space and returns the refreshed horse", async () => {
		mockGetHorseById
			.mockResolvedValueOnce({
				id: "h1",
				name: "Pink Diamond Lass",
				organizationId: "org1",
				circleSpaceId: null,
				circleSpaceStatus: "provisioning_failed",
			})
			.mockResolvedValueOnce({
				id: "h1",
				name: "Pink Diamond Lass",
				organizationId: "org1",
				circleSpaceId: "777",
				circleSpaceStatus: "active",
			});

		const result = await call(retryHorseSpaceProvisioning, { horseId: "h1" }, ctx);

		expect(mockProvisionHorseSpace).toHaveBeenCalledWith({
			id: "h1",
			name: "Pink Diamond Lass",
			organizationId: "org1",
		});
		expect(result).toMatchObject({ circleSpaceId: "777", circleSpaceStatus: "active" });
	});

	it("skips provisioning when the horse already has a space", async () => {
		mockGetHorseById.mockResolvedValue({
			id: "h1",
			name: "Pink Diamond Lass",
			organizationId: "org1",
			circleSpaceId: "999",
		});

		await call(retryHorseSpaceProvisioning, { horseId: "h1" }, ctx);

		expect(mockProvisionHorseSpace).not.toHaveBeenCalled();
	});

	it("throws NOT_FOUND for an unknown horse", async () => {
		mockGetHorseById.mockResolvedValue(null);

		await expect(call(retryHorseSpaceProvisioning, { horseId: "nope" }, ctx)).rejects.toThrow();
		expect(mockProvisionHorseSpace).not.toHaveBeenCalled();
	});
});
