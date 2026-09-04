import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockListSpaceGroups, mockListSpaces } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockListSpaceGroups: vi.fn(),
	mockListSpaces: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: () => ({ listSpaceGroups: mockListSpaceGroups, listSpaces: mockListSpaces }),
}));

import { listSpaces } from "../procedures/admin/list-spaces";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const ORG_ID = "org1";

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
});

describe("admin.community.listSpaces (S12-02a)", () => {
	it("joins Circle spaces + groups with metadata posting settings, sorted by group then space name", async () => {
		mockOrgFindUnique.mockResolvedValue({
			slug: "rionna",
			metadata: JSON.stringify({
				circle: {
					spaceGroupId: "grp-horses",
					spaces: { "1": { memberPosting: true, hideChip: true } },
				},
			}),
		});
		mockListSpaceGroups.mockResolvedValue({
			ok: true,
			data: [
				{ id: "grp-horses", name: "Horses" },
				{ id: "grp-general", name: "General" },
			],
		});
		mockListSpaces.mockResolvedValue({
			ok: true,
			data: [
				{ id: "1", name: "Pink Diamond Lass", spaceGroupId: "grp-horses", isPrivate: true },
				{ id: "2", name: "Announcements", spaceGroupId: "grp-general", isPrivate: false },
				{ id: "3", name: "Unlisted Space", spaceGroupId: undefined, isPrivate: false },
			],
		});

		const result = await call(listSpaces, { organizationId: ORG_ID }, ctx);

		expect(result.circleReachable).toBe(true);
		expect(result.spaces).toEqual([
			{
				id: "2",
				name: "Announcements",
				groupName: "General",
				isHorse: false,
				memberPosting: false,
				hideChip: false,
			},
			{
				id: "1",
				name: "Pink Diamond Lass",
				groupName: "Horses",
				isHorse: true,
				memberPosting: true,
				hideChip: true,
			},
			{
				id: "3",
				name: "Unlisted Space",
				groupName: null,
				isHorse: false,
				memberPosting: false,
				hideChip: false,
			},
		]);
	});

	it("defaults memberPosting/hideChip to false for a space missing from metadata", async () => {
		mockOrgFindUnique.mockResolvedValue({ slug: "rionna", metadata: JSON.stringify({}) });
		mockListSpaceGroups.mockResolvedValue({ ok: true, data: [] });
		mockListSpaces.mockResolvedValue({
			ok: true,
			data: [{ id: "9", name: "New Space", spaceGroupId: undefined, isPrivate: false }],
		});

		const result = await call(listSpaces, { organizationId: ORG_ID }, ctx);

		expect(result.spaces).toEqual([
			{
				id: "9",
				name: "New Space",
				groupName: null,
				isHorse: false,
				memberPosting: false,
				hideChip: false,
			},
		]);
	});

	it("returns circleReachable:false and an empty list when Circle's listSpaces call fails", async () => {
		mockOrgFindUnique.mockResolvedValue({ slug: "rionna", metadata: JSON.stringify({}) });
		mockListSpaceGroups.mockResolvedValue({ ok: true, data: [] });
		mockListSpaces.mockResolvedValue({ ok: false, reason: "network", retriable: true });

		const result = await call(listSpaces, { organizationId: ORG_ID }, ctx);

		expect(result).toEqual({ circleReachable: false, spaces: [] });
	});

	it("returns circleReachable:false and an empty list when Circle throws", async () => {
		mockOrgFindUnique.mockResolvedValue({ slug: "rionna", metadata: JSON.stringify({}) });
		mockListSpaceGroups.mockRejectedValue(new Error("boom"));
		mockListSpaces.mockResolvedValue({ ok: true, data: [] });

		const result = await call(listSpaces, { organizationId: ORG_ID }, ctx);

		expect(result).toEqual({ circleReachable: false, spaces: [] });
	});

	it("throws FORBIDDEN when organizationId does not match the caller's active org", async () => {
		await expect(call(listSpaces, { organizationId: "other-org" }, ctx)).rejects.toThrow();
		expect(mockOrgFindUnique).not.toHaveBeenCalled();
	});
});
