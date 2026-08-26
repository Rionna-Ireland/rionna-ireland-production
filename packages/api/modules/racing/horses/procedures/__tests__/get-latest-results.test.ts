import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetLatestResults, mockGetAccessibleHorseWhere } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetLatestResults: vi.fn(),
	mockGetAccessibleHorseWhere: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	getLatestResults: mockGetLatestResults,
}));

vi.mock("../../lib/horse-access", () => ({
	getAccessibleHorseWhere: mockGetAccessibleHorseWhere,
}));

import { getLatestResultsProcedure } from "../get-latest-results";

const MEMBER = { id: "user-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

const ACCESSIBLE_WHERE = { OR: [{ inviteOnly: false }, { id: { in: ["h-1"] } }] };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: MEMBER, session: SESSION });
	mockGetAccessibleHorseWhere.mockResolvedValue(ACCESSIBLE_WHERE);
});

describe("getLatestResultsProcedure (S9-05 invite-only gating)", () => {
	it("passes the caller's accessible-horse where into the query", async () => {
		mockGetLatestResults.mockResolvedValue([{ id: "entry-1" }]);

		await call(getLatestResultsProcedure, { organizationId: "org-1", limit: 3 }, ctx);

		expect(mockGetAccessibleHorseWhere).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "user-1",
		});
		expect(mockGetLatestResults).toHaveBeenCalledWith("org-1", 3, ACCESSIBLE_WHERE);
	});

	it("defaults limit to 3", async () => {
		mockGetLatestResults.mockResolvedValue([]);

		await call(getLatestResultsProcedure, { organizationId: "org-1" }, ctx);

		expect(mockGetLatestResults).toHaveBeenCalledWith("org-1", 3, ACCESSIBLE_WHERE);
	});
});
