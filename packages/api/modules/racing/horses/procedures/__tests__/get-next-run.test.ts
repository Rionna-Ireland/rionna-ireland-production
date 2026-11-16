import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetNextRun, mockGetAccessibleHorseWhere } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetNextRun: vi.fn(),
	mockGetAccessibleHorseWhere: vi.fn(),
}));

const mockPaidMember = vi.hoisted(() =>
	vi.fn(async (): Promise<{ id: string } | null> => ({ id: "m-1" })),
);
vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	// memberProcedure gate (W-04): the caller is a paying member.
	db: { member: { findFirst: mockPaidMember } },
	getNextRun: mockGetNextRun,
}));

vi.mock("../../lib/horse-access", () => ({
	getAccessibleHorseWhere: mockGetAccessibleHorseWhere,
}));

import { getNextRunProcedure } from "../get-next-run";

const MEMBER = { id: "user-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

const ACCESSIBLE_WHERE = { OR: [{ inviteOnly: false }, { id: { in: ["h-1"] } }] };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: MEMBER, session: SESSION });
	mockGetAccessibleHorseWhere.mockResolvedValue(ACCESSIBLE_WHERE);
});

describe("getNextRunProcedure (S9-05 invite-only gating)", () => {
	it("passes the caller's accessible-horse where into the query", async () => {
		mockGetNextRun.mockResolvedValue({ id: "entry-1" });

		await call(getNextRunProcedure, { organizationId: "org-1" }, ctx);

		expect(mockGetAccessibleHorseWhere).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "user-1",
		});
		expect(mockGetNextRun).toHaveBeenCalledWith("org-1", ACCESSIBLE_WHERE);
	});

	it("returns the query result unchanged", async () => {
		mockGetNextRun.mockResolvedValue({ id: "entry-1" });

		const res = await call(getNextRunProcedure, { organizationId: "org-1" }, ctx);

		expect(res).toEqual({ id: "entry-1" });
	});
});
