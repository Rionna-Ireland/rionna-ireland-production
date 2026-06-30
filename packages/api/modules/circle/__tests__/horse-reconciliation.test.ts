/**
 * reconcileCircleHorseSpaces tests (S2-09 surface F)
 *
 * The reconciliation cron retries horse-space provisioning that the create-horse
 * hot path couldn't complete (Circle down, spaceGroupId not yet configured).
 * Scans horses with no space + a null/failed status, retries each independently,
 * and counts outcomes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockHorseFindMany, mockProvisionHorseSpace } = vi.hoisted(() => ({
	mockHorseFindMany: vi.fn(),
	mockProvisionHorseSpace: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: { horse: { findMany: mockHorseFindMany } },
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({ createCircleService: vi.fn() }));

vi.mock("@repo/payments/lib/circle-horse-provisioning", () => ({
	provisionHorseSpace: mockProvisionHorseSpace,
}));

import { reconcileCircleHorseSpaces } from "../reconciliation";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("reconcileCircleHorseSpaces (S2-09)", () => {
	it("retries horses with no space (null or failed status) and counts successes", async () => {
		mockHorseFindMany.mockResolvedValue([
			{ id: "h1", name: "A", organizationId: "org1" },
			{ id: "h2", name: "B", organizationId: "org1" },
		]);
		mockProvisionHorseSpace.mockResolvedValue({ ok: true });

		const result = await reconcileCircleHorseSpaces("org1");

		expect(result).toEqual({ provisioned: 2, errors: 0 });
		expect(mockHorseFindMany).toHaveBeenCalledWith({
			where: {
				organizationId: "org1",
				circleSpaceId: null,
				OR: [{ circleSpaceStatus: null }, { circleSpaceStatus: "provisioning_failed" }],
			},
			select: { id: true, name: true, organizationId: true },
		});
		expect(mockProvisionHorseSpace).toHaveBeenCalledTimes(2);
	});

	it("counts a horse whose retry still fails as an error, not a success", async () => {
		mockHorseFindMany.mockResolvedValue([
			{ id: "h1", name: "A", organizationId: "org1" },
			{ id: "h2", name: "B", organizationId: "org1" },
		]);
		mockProvisionHorseSpace
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: false });

		const result = await reconcileCircleHorseSpaces("org1");

		expect(result).toEqual({ provisioned: 1, errors: 1 });
	});

	it("is a no-op when every horse already has a space", async () => {
		mockHorseFindMany.mockResolvedValue([]);

		const result = await reconcileCircleHorseSpaces("org1");

		expect(result).toEqual({ provisioned: 0, errors: 0 });
		expect(mockProvisionHorseSpace).not.toHaveBeenCalled();
	});
});
