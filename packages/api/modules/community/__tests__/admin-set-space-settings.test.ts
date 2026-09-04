import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockOrgUpdateMany } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockOrgUpdateMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique, updateMany: mockOrgUpdateMany },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { setSpaceSettings } from "../procedures/admin/set-space-settings";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const ORG_ID = "org1";
const SPACE_ID = "42";

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockOrgUpdateMany.mockResolvedValue({ count: 1 });
});

describe("admin.community.setSpaceSettings (S12-02a)", () => {
	it("merges memberPosting into circle.spaces[spaceId], preserving other spaces and keys", async () => {
		const rawMetadata = JSON.stringify({
			circle: {
				communitySpaceId: "1",
				spaces: {
					"1": { memberPosting: false },
					[SPACE_ID]: { memberPosting: false, hideChip: true },
				},
			},
		});
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, metadata: rawMetadata });

		const result = await call(
			setSpaceSettings,
			{ organizationId: ORG_ID, spaceId: SPACE_ID, memberPosting: true },
			ctx,
		);

		expect(result).toEqual({ ok: true, settings: { memberPosting: true, hideChip: true } });
		expect(mockOrgUpdateMany).toHaveBeenCalledWith({
			where: { id: ORG_ID, metadata: rawMetadata },
			data: {
				metadata: JSON.stringify({
					circle: {
						communitySpaceId: "1",
						spaces: {
							"1": { memberPosting: false },
							[SPACE_ID]: { memberPosting: true, hideChip: true },
						},
					},
				}),
			},
		});
	});

	it("retries once when the first compare-and-set misses, then succeeds with the re-read value", async () => {
		const staleMetadata = JSON.stringify({
			circle: { spaces: { [SPACE_ID]: { memberPosting: false } } },
		});
		const freshMetadata = JSON.stringify({
			circle: { spaces: { [SPACE_ID]: { memberPosting: false, hideChip: true } } },
		});
		mockOrgFindUnique
			.mockResolvedValueOnce({ id: ORG_ID, metadata: staleMetadata })
			.mockResolvedValueOnce({ id: ORG_ID, metadata: freshMetadata });
		mockOrgUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

		const result = await call(
			setSpaceSettings,
			{ organizationId: ORG_ID, spaceId: SPACE_ID, memberPosting: true },
			ctx,
		);

		expect(result).toEqual({ ok: true, settings: { memberPosting: true, hideChip: true } });
		expect(mockOrgFindUnique).toHaveBeenCalledTimes(2);
		expect(mockOrgUpdateMany).toHaveBeenCalledTimes(2);
		expect(mockOrgUpdateMany).toHaveBeenNthCalledWith(2, {
			where: { id: ORG_ID, metadata: freshMetadata },
			data: {
				metadata: JSON.stringify({
					circle: { spaces: { [SPACE_ID]: { memberPosting: true, hideChip: true } } },
				}),
			},
		});
	});

	it("throws after three straight compare-and-set misses", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, metadata: JSON.stringify({}) });
		mockOrgUpdateMany.mockResolvedValue({ count: 0 });

		await expect(
			call(
				setSpaceSettings,
				{ organizationId: ORG_ID, spaceId: SPACE_ID, memberPosting: true },
				ctx,
			),
		).rejects.toThrow();
		expect(mockOrgFindUnique).toHaveBeenCalledTimes(3);
		expect(mockOrgUpdateMany).toHaveBeenCalledTimes(3);
	});

	it("defaults hideChip to false for a space with no prior entry", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, metadata: JSON.stringify({}) });

		const result = await call(
			setSpaceSettings,
			{ organizationId: ORG_ID, spaceId: SPACE_ID, memberPosting: true },
			ctx,
		);

		expect(result).toEqual({ ok: true, settings: { memberPosting: true, hideChip: false } });
	});

	it("logs admin_space_settings_updated", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, metadata: JSON.stringify({}) });
		const { logger } = await import("@repo/logs");

		await call(
			setSpaceSettings,
			{ organizationId: ORG_ID, spaceId: SPACE_ID, hideChip: true },
			ctx,
		);

		expect(logger.info).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_space_settings_updated",
				actorUserId: ADMIN.id,
				organizationId: ORG_ID,
				spaceId: SPACE_ID,
			}),
		);
	});

	it("rejects when neither memberPosting nor hideChip is set (zod refine)", async () => {
		await expect(
			call(setSpaceSettings, { organizationId: ORG_ID, spaceId: SPACE_ID }, ctx),
		).rejects.toThrow();
		expect(mockOrgFindUnique).not.toHaveBeenCalled();
	});

	it("throws FORBIDDEN when organizationId does not match the caller's active org", async () => {
		await expect(
			call(
				setSpaceSettings,
				{ organizationId: "other-org", spaceId: SPACE_ID, hideChip: true },
				ctx,
			),
		).rejects.toThrow();
		expect(mockOrgFindUnique).not.toHaveBeenCalled();
	});
});
