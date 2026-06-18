/**
 * provisionHorseSpace tests (S2-09 surface F)
 *
 * "A horse IS a Circle space." On horse create we auto-provision a private
 * space under the club's space group, mirroring member provisioning: fail-safe
 * (never throws), recording circleSpaceStatus="provisioning_failed" on any
 * problem so the reconciliation cron retries. A missing spaceGroupId is itself
 * a deferrable failure (operator configures it, cron retries).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockOrgFindUnique,
	mockHorseUpdate,
	mockParseOrgMetadata,
	mockCreateSpace,
	mockLoggerInfo,
	mockLoggerWarn,
	mockLoggerError,
} = vi.hoisted(() => ({
	mockOrgFindUnique: vi.fn(),
	mockHorseUpdate: vi.fn(),
	mockParseOrgMetadata: vi.fn(),
	mockCreateSpace: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
	mockLoggerError: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		horse: { update: mockHorseUpdate },
	},
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: mockLoggerError, log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({ createSpace: mockCreateSpace })),
}));

import { provisionHorseSpace } from "@repo/payments/lib/circle-horse-provisioning";

const ORG = { id: "org1", slug: "rionna", metadata: "{}" };
const HORSE = { id: "h1", name: "Pink Diamond Lass", organizationId: "org1" };

describe("provisionHorseSpace (S2-09 surface F)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockOrgFindUnique.mockResolvedValue(ORG);
		mockParseOrgMetadata.mockReturnValue({ circle: { spaceGroupId: "1081220" } });
		mockCreateSpace.mockResolvedValue({ ok: true, data: { circleSpaceId: "777" } });
		mockHorseUpdate.mockResolvedValue({});
	});

	it("creates a private space under the club's space group and links it to the horse", async () => {
		await provisionHorseSpace(HORSE);

		expect(mockCreateSpace).toHaveBeenCalledWith({
			name: "Pink Diamond Lass",
			spaceGroupId: "1081220",
			spaceType: "basic",
			isPrivate: true,
			idempotencyKey: "horse-space-h1",
		});
		expect(mockHorseUpdate).toHaveBeenCalledWith({
			where: { id: "h1" },
			data: {
				circleSpaceId: "777",
				circleSpaceStatus: "active",
				circleSpaceProvisionedAt: expect.any(Date),
			},
		});
	});

	it("records provisioning_failed (no throw) when Circle rejects the space", async () => {
		mockCreateSpace.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });

		await expect(provisionHorseSpace(HORSE)).resolves.toEqual({ ok: false });

		expect(mockHorseUpdate).toHaveBeenCalledWith({
			where: { id: "h1" },
			data: { circleSpaceStatus: "provisioning_failed" },
		});
	});

	it("defers with provisioning_failed when no spaceGroupId is configured (no Circle call)", async () => {
		mockParseOrgMetadata.mockReturnValue({ circle: {} });

		await provisionHorseSpace(HORSE);

		expect(mockCreateSpace).not.toHaveBeenCalled();
		expect(mockHorseUpdate).toHaveBeenCalledWith({
			where: { id: "h1" },
			data: { circleSpaceStatus: "provisioning_failed" },
		});
	});

	it("no-ops when the org has no slug (cannot build a Circle service)", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: null, metadata: "{}" });

		await provisionHorseSpace(HORSE);

		expect(mockCreateSpace).not.toHaveBeenCalled();
		expect(mockHorseUpdate).not.toHaveBeenCalled();
	});
});
