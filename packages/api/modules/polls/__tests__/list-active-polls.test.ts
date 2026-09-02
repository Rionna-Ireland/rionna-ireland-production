import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockMemberFindFirst,
	mockGetVisiblePolls,
	mockGetVoteCountRows,
	mockGetMemberVotes,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockGetVisiblePolls: vi.fn(),
	mockGetVoteCountRows: vi.fn(),
	mockGetMemberVotes: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module instantiates the
// Prisma client at import time and throws when DATABASE_URL is unset. parseOrgMetadata
// is pulled from the Prisma-free "@repo/database/types" subpath so the kill-switch test
// still exercises real JSON parsing.
vi.mock("@repo/database", async () => {
	const { parseOrgMetadata } = await import("@repo/database/types");
	return {
		db: {
			organization: { findUnique: mockOrgFindUnique },
			member: { findFirst: mockMemberFindFirst },
		},
		parseOrgMetadata,
		getVisiblePolls: mockGetVisiblePolls,
		getVoteCountRows: mockGetVoteCountRows,
		getMemberVotes: mockGetMemberVotes,
	};
});

import { listActivePolls } from "../procedures/list-active-polls";

const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const POLL = {
	id: "p1",
	organizationId: "org1",
	question: "Which charity?",
	scope: "club",
	circleSpaceId: null,
	status: "open",
	publishedAt: new Date("2026-09-01T09:00:00Z"),
	closesAt: null,
	closedAt: null,
	options: [
		{ id: "o1", label: "A", sortOrder: 0 },
		{ id: "o2", label: "B", sortOrder: 1 },
	],
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", metadata: "{}" });
	mockMemberFindFirst.mockResolvedValue({ id: "m1" });
	mockGetVisiblePolls.mockResolvedValue([POLL]);
	mockGetVoteCountRows.mockResolvedValue([{ pollId: "p1", optionId: "o1", _count: { _all: 2 } }]);
	mockGetMemberVotes.mockResolvedValue({});
});

describe("polls.listActive", () => {
	it("returns club-scope poll cards with results hidden until voted", async () => {
		const result = await call(listActivePolls, { organizationId: "org1" }, ctx);
		expect(result.ok).toBe(true);
		expect(result.polls).toHaveLength(1);
		expect(result.polls[0]).toMatchObject({
			id: "p1",
			status: "open",
			myVoteOptionId: null,
			results: null,
		});
		expect(mockGetVisiblePolls).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: "org1", spaceIds: [] }),
		);
	});
	it("includes results when the member has voted", async () => {
		mockGetMemberVotes.mockResolvedValue({ p1: "o1" });
		const result = await call(listActivePolls, { organizationId: "org1" }, ctx);
		expect(result.polls[0].results).toEqual({ total: 2, byOption: { o1: 2, o2: 0 } });
		expect(result.polls[0].myVoteOptionId).toBe("o1");
	});
	it("fails open to an empty list for non-members", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		const result = await call(listActivePolls, { organizationId: "org1" }, ctx);
		expect(result).toEqual({ ok: true, polls: [] });
		expect(mockGetVisiblePolls).not.toHaveBeenCalled();
	});
	it("returns nothing when the org has polls switched off", async () => {
		mockOrgFindUnique.mockResolvedValue({
			id: "org1",
			metadata: JSON.stringify({ features: { polls: false } }),
		});
		const result = await call(listActivePolls, { organizationId: "org1" }, ctx);
		expect(result).toEqual({ ok: true, polls: [] });
	});
});
