import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
}));
vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));

import { getHorseFollowsEnabledProcedure } from "../get-horse-follows-enabled";

const USER = { id: "u-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockOrgFindUnique.mockResolvedValue({ metadata: null });
});

describe("getHorseFollowsEnabledProcedure", () => {
	it("is enabled by default when features.horseFollows is unset (S8-04 §5)", async () => {
		const res = await call(
			getHorseFollowsEnabledProcedure,
			{ organizationId: "org-1" },
			ctx,
		);
		expect(res).toEqual({ enabled: true });
	});

	it("is disabled when features.horseFollows is explicitly false", async () => {
		mockOrgFindUnique.mockResolvedValue({
			metadata: JSON.stringify({ features: { horseFollows: false } }),
		});
		const res = await call(
			getHorseFollowsEnabledProcedure,
			{ organizationId: "org-1" },
			ctx,
		);
		expect(res).toEqual({ enabled: false });
	});

	it("is enabled when features.horseFollows is explicitly true", async () => {
		mockOrgFindUnique.mockResolvedValue({
			metadata: JSON.stringify({ features: { horseFollows: true } }),
		});
		const res = await call(
			getHorseFollowsEnabledProcedure,
			{ organizationId: "org-1" },
			ctx,
		);
		expect(res).toEqual({ enabled: true });
	});
});
