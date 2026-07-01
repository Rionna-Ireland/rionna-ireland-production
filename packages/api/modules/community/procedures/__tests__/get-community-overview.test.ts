/**
 * getCommunityOverview tests (S6-07)
 *
 * Fail-safe read: merges live Circle space-group/space data onto the local
 * horse rows. Local horse rows must always render, even when Circle is down.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrganizationFindUnique, mockHorseFindMany, mockCreateCircleService, mockListSpaceGroups, mockListSpaces } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockOrganizationFindUnique: vi.fn(),
		mockHorseFindMany: vi.fn(),
		mockCreateCircleService: vi.fn(),
		mockListSpaceGroups: vi.fn(),
		mockListSpaces: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrganizationFindUnique },
		horse: { findMany: mockHorseFindMany },
	},
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: mockCreateCircleService,
}));

import { runCommunityOverview } from "../get-community-overview";

const HORSES = [
	{
		id: "h1",
		name: "Shergar",
		circleSpaceId: "sp-1",
		circleSpaceStatus: "active",
		circleSpaceVisibility: "private",
	},
	{
		id: "h2",
		name: "Arkle",
		circleSpaceId: null,
		circleSpaceStatus: null,
		circleSpaceVisibility: null,
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: { id: "admin", role: "admin" }, session: { id: "s1", activeOrganizationId: "org1" } });
	mockOrganizationFindUnique.mockResolvedValue({ id: "org1", slug: "acme" });
	mockHorseFindMany.mockResolvedValue(HORSES);
	mockCreateCircleService.mockReturnValue({
		listSpaceGroups: mockListSpaceGroups,
		listSpaces: mockListSpaces,
	});
});

describe("runCommunityOverview (S6-07)", () => {
	it("merges Circle live counts onto local horse rows by circleSpaceId", async () => {
		mockListSpaceGroups.mockResolvedValue({
			ok: true,
			data: [{ id: "sg-1", name: "Horses", spacesCount: 2, membersCount: 10 }],
		});
		mockListSpaces.mockResolvedValue({
			ok: true,
			data: [{ id: "sp-1", name: "Shergar", isPrivate: true, membersCount: 5, postsCount: 12 }],
		});

		const result = await runCommunityOverview("org1");

		expect(result.circleReachable).toBe(true);
		expect(result.spaceGroups).toEqual([{ id: "sg-1", name: "Horses", spacesCount: 2, membersCount: 10 }]);
		expect(result.horseSpaces).toEqual([
			{
				horseId: "h1",
				name: "Shergar",
				circleSpaceId: "sp-1",
				circleSpaceStatus: "active",
				circleSpaceVisibility: "private",
				membersCount: 5,
				postsCount: 12,
			},
			{
				horseId: "h2",
				name: "Arkle",
				circleSpaceId: null,
				circleSpaceStatus: null,
				circleSpaceVisibility: null,
			},
		]);
	});

	it("is fail-safe: local horse rows still render when Circle is unreachable", async () => {
		mockListSpaceGroups.mockResolvedValue({ ok: false, reason: "network", retriable: true });
		mockListSpaces.mockResolvedValue({ ok: false, reason: "network", retriable: true });

		const result = await runCommunityOverview("org1");

		expect(result.circleReachable).toBe(false);
		expect(result.spaceGroups).toEqual([]);
		expect(result.horseSpaces).toEqual([
			{
				horseId: "h1",
				name: "Shergar",
				circleSpaceId: "sp-1",
				circleSpaceStatus: "active",
				circleSpaceVisibility: "private",
			},
			{
				horseId: "h2",
				name: "Arkle",
				circleSpaceId: null,
				circleSpaceStatus: null,
				circleSpaceVisibility: null,
			},
		]);
		expect(result.horseSpaces[0]?.membersCount).toBeUndefined();
	});
});
