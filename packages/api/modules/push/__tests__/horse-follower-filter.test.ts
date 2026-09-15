import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockOrgFindUnique, mockHorseFindUnique, mockHorseFollowFindMany } = vi.hoisted(() => ({
	mockOrgFindUnique: vi.fn(),
	mockHorseFindUnique: vi.fn(),
	mockHorseFollowFindMany: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		horse: { findUnique: mockHorseFindUnique },
		horseFollow: { findMany: mockHorseFollowFindMany },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));

import { resolveHorseFollowerUserIds } from "../horse-follower-filter";

beforeEach(() => {
	vi.clearAllMocks();
	mockHorseFollowFindMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
});

describe("resolveHorseFollowerUserIds", () => {
	it("filters to followers when follows are enabled", async () => {
		mockOrgFindUnique.mockResolvedValue({ metadata: null });
		mockHorseFindUnique.mockResolvedValue({ inviteOnly: false });
		expect(await resolveHorseFollowerUserIds("org1", "h1")).toEqual(new Set(["u1", "u2"]));
	});

	it("returns null (everyone) when follows are disabled and the horse is open", async () => {
		mockOrgFindUnique.mockResolvedValue({ metadata: JSON.stringify({ features: { horseFollows: false } }) });
		mockHorseFindUnique.mockResolvedValue({ inviteOnly: false });
		expect(await resolveHorseFollowerUserIds("org1", "h1")).toBeNull();
	});

	it("still filters invite-only horses when follows are disabled", async () => {
		mockOrgFindUnique.mockResolvedValue({ metadata: JSON.stringify({ features: { horseFollows: false } }) });
		mockHorseFindUnique.mockResolvedValue({ inviteOnly: true });
		expect(await resolveHorseFollowerUserIds("org1", "h1")).toEqual(new Set(["u1", "u2"]));
	});

	it("fails closed when the horse is missing", async () => {
		mockOrgFindUnique.mockResolvedValue({ metadata: JSON.stringify({ features: { horseFollows: false } }) });
		mockHorseFindUnique.mockResolvedValue(null);
		expect(await resolveHorseFollowerUserIds("org1", "h1")).toEqual(new Set(["u1", "u2"]));
	});
});
