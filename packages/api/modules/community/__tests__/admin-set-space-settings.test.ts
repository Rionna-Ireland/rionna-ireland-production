import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockOrgUpdateMany, mockHorseFindMany, mockListSpaces } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockOrgFindUnique: vi.fn(),
		mockOrgUpdateMany: vi.fn(),
		mockHorseFindMany: vi.fn(),
		mockListSpaces: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique, updateMany: mockOrgUpdateMany },
		horse: { findMany: mockHorseFindMany },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
	isHorseSpace: (
		metadata: { circle?: { spaceGroupId?: string } },
		space: { spaceGroupId: string | null },
	) => space.spaceGroupId !== null && space.spaceGroupId === metadata.circle?.spaceGroupId,
}));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: () => ({ listSpaces: mockListSpaces }),
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
	mockHorseFindMany.mockResolvedValue([]);
	mockListSpaces.mockResolvedValue({
		ok: true,
		data: [{ id: SPACE_ID, name: "Networking", isPrivate: false, spaceGroupId: null }],
	});
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

		expect(result).toEqual({
			ok: true,
			settings: { memberPosting: true, hideChip: true, autoJoin: false },
		});
		expect(mockOrgUpdateMany).toHaveBeenCalledWith({
			where: { id: ORG_ID, metadata: rawMetadata },
			data: {
				metadata: JSON.stringify({
					circle: {
						communitySpaceId: "1",
						spaces: {
							"1": { memberPosting: false },
							[SPACE_ID]: { memberPosting: true, hideChip: true, autoJoin: false },
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

		expect(result).toEqual({
			ok: true,
			settings: { memberPosting: true, hideChip: true, autoJoin: false },
		});
		expect(mockOrgFindUnique).toHaveBeenCalledTimes(2);
		expect(mockOrgUpdateMany).toHaveBeenCalledTimes(2);
		expect(mockOrgUpdateMany).toHaveBeenNthCalledWith(2, {
			where: { id: ORG_ID, metadata: freshMetadata },
			data: {
				metadata: JSON.stringify({
					circle: {
						spaces: { [SPACE_ID]: { memberPosting: true, hideChip: true, autoJoin: false } },
					},
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

	it("defaults hideChip and autoJoin to false for a space with no prior entry", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, metadata: JSON.stringify({}) });

		const result = await call(
			setSpaceSettings,
			{ organizationId: ORG_ID, spaceId: SPACE_ID, memberPosting: true },
			ctx,
		);

		expect(result).toEqual({
			ok: true,
			settings: { memberPosting: true, hideChip: false, autoJoin: false },
		});
	});

	it("merges autoJoin without clobbering memberPosting/hideChip", async () => {
		const rawMetadata = JSON.stringify({
			circle: { spaces: { [SPACE_ID]: { memberPosting: true, hideChip: true } } },
		});
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: rawMetadata });

		const result = await call(
			setSpaceSettings,
			{ organizationId: ORG_ID, spaceId: SPACE_ID, autoJoin: true },
			ctx,
		);

		expect(result).toEqual({
			ok: true,
			settings: { memberPosting: true, hideChip: true, autoJoin: true },
		});
		expect(mockOrgUpdateMany).toHaveBeenCalledWith({
			where: { id: ORG_ID, metadata: rawMetadata },
			data: {
				metadata: JSON.stringify({
					circle: {
						spaces: { [SPACE_ID]: { memberPosting: true, hideChip: true, autoJoin: true } },
					},
				}),
			},
		});
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

	describe("I1 — private/horse auto-join guard", () => {
		it("rejects autoJoin:true for a private space", async () => {
			mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: JSON.stringify({}) });
			mockListSpaces.mockResolvedValue({
				ok: true,
				data: [{ id: SPACE_ID, name: "Private space", isPrivate: true, spaceGroupId: null }],
			});

			await expect(
				call(setSpaceSettings, { organizationId: ORG_ID, spaceId: SPACE_ID, autoJoin: true }, ctx),
			).rejects.toThrow();
			expect(mockOrgUpdateMany).not.toHaveBeenCalled();
		});

		it("rejects autoJoin:true for a space matched by Horse.circleSpaceId", async () => {
			mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: JSON.stringify({}) });
			mockListSpaces.mockResolvedValue({
				ok: true,
				data: [{ id: SPACE_ID, name: "Harry", isPrivate: false, spaceGroupId: null }],
			});
			mockHorseFindMany.mockResolvedValue([{ circleSpaceId: SPACE_ID }]);

			await expect(
				call(setSpaceSettings, { organizationId: ORG_ID, spaceId: SPACE_ID, autoJoin: true }, ctx),
			).rejects.toThrow();
			expect(mockOrgUpdateMany).not.toHaveBeenCalled();
		});

		it("rejects autoJoin:true for a space matched only by the drifted group-id signal", async () => {
			mockOrgFindUnique.mockResolvedValue({
				id: ORG_ID,
				slug: "rionna",
				metadata: JSON.stringify({ circle: { spaceGroupId: "horse-group" } }),
			});
			mockListSpaces.mockResolvedValue({
				ok: true,
				data: [{ id: SPACE_ID, name: "Drifted horse", isPrivate: false, spaceGroupId: "horse-group" }],
			});

			await expect(
				call(setSpaceSettings, { organizationId: ORG_ID, spaceId: SPACE_ID, autoJoin: true }, ctx),
			).rejects.toThrow();
			expect(mockOrgUpdateMany).not.toHaveBeenCalled();
		});

		it("allows autoJoin:true for a public, non-horse space", async () => {
			mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: JSON.stringify({}) });
			mockListSpaces.mockResolvedValue({
				ok: true,
				data: [{ id: SPACE_ID, name: "Networking", isPrivate: false, spaceGroupId: null }],
			});

			const result = await call(
				setSpaceSettings,
				{ organizationId: ORG_ID, spaceId: SPACE_ID, autoJoin: true },
				ctx,
			);

			expect(result.ok).toBe(true);
			expect(mockOrgUpdateMany).toHaveBeenCalled();
		});

		it("does not run the guard for a patch that doesn't touch autoJoin", async () => {
			mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: JSON.stringify({}) });

			await call(setSpaceSettings, { organizationId: ORG_ID, spaceId: SPACE_ID, hideChip: true }, ctx);

			expect(mockListSpaces).not.toHaveBeenCalled();
		});
	});

	describe("residual fix — fail closed when Circle can't be verified", () => {
		it("rejects autoJoin:true when the Circle space listing is down", async () => {
			mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: JSON.stringify({}) });
			mockListSpaces.mockResolvedValue({ ok: false, reason: "server_error" });

			await expect(
				call(setSpaceSettings, { organizationId: ORG_ID, spaceId: SPACE_ID, autoJoin: true }, ctx),
			).rejects.toThrow();
			expect(mockOrgUpdateMany).not.toHaveBeenCalled();
		});

		it("rejects autoJoin:true when the org has no slug", async () => {
			mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: null, metadata: JSON.stringify({}) });

			await expect(
				call(setSpaceSettings, { organizationId: ORG_ID, spaceId: SPACE_ID, autoJoin: true }, ctx),
			).rejects.toThrow();
			expect(mockListSpaces).not.toHaveBeenCalled();
			expect(mockOrgUpdateMany).not.toHaveBeenCalled();
		});

		it("leaves hideChip/memberPosting-only updates unaffected by the listing-down guard", async () => {
			mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: JSON.stringify({}) });
			mockListSpaces.mockResolvedValue({ ok: false, reason: "server_error" });

			const result = await call(
				setSpaceSettings,
				{ organizationId: ORG_ID, spaceId: SPACE_ID, hideChip: true },
				ctx,
			);

			expect(result.ok).toBe(true);
			expect(mockListSpaces).not.toHaveBeenCalled();
		});
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
