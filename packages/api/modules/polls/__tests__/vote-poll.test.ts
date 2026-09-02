import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockMemberFindFirst,
	mockGetPollForOrg,
	mockUpsertPollVote,
	mockGetVoteCountRows,
	mockGetMemberVotes,
	mockInvalidateFeed,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockGetPollForOrg: vi.fn(),
	mockUpsertPollVote: vi.fn(),
	mockGetVoteCountRows: vi.fn(),
	mockGetMemberVotes: vi.fn(),
	mockInvalidateFeed: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module instantiates the
// Prisma client at import time and throws when DATABASE_URL is unset.
vi.mock("@repo/database", () => ({
	db: { member: { findFirst: mockMemberFindFirst } },
	getPollForOrg: mockGetPollForOrg,
	upsertPollVote: mockUpsertPollVote,
	getVoteCountRows: mockGetVoteCountRows,
	getMemberVotes: mockGetMemberVotes,
}));
vi.mock("../../circle/lib/member-feed-cache", () => ({
	invalidateMemberFeedCache: mockInvalidateFeed,
}));

import { votePoll } from "../procedures/vote-poll";

const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };
const INPUT = { organizationId: "org1", pollId: "p1", optionId: "o2" };

const openPoll = () => ({
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
});

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockMemberFindFirst.mockResolvedValue({ id: "m1" });
	mockGetPollForOrg.mockResolvedValue(openPoll());
	mockUpsertPollVote.mockResolvedValue(undefined);
	mockGetVoteCountRows.mockResolvedValue([{ pollId: "p1", optionId: "o2", _count: { _all: 1 } }]);
	mockGetMemberVotes.mockResolvedValue({ p1: "o2" });
});

describe("polls.vote", () => {
	it("upserts the vote, invalidates the feed cache, and returns the card with results", async () => {
		const result = await call(votePoll, INPUT, ctx);
		expect(mockUpsertPollVote).toHaveBeenCalledWith({
			pollId: "p1",
			optionId: "o2",
			userId: "u1",
		});
		expect(mockInvalidateFeed).toHaveBeenCalledWith("u1", "org1");
		expect(result).toMatchObject({
			ok: true,
			poll: {
				id: "p1",
				myVoteOptionId: "o2",
				results: { total: 1, byOption: { o1: 0, o2: 1 } },
			},
		});
	});
	it("rejects a closed poll", async () => {
		mockGetPollForOrg.mockResolvedValue({ ...openPoll(), status: "closed" });
		expect(await call(votePoll, INPUT, ctx)).toEqual({ ok: false, reason: "closed" });
		expect(mockUpsertPollVote).not.toHaveBeenCalled();
	});
	it("rejects an open poll whose closesAt has passed (lazy auto-close)", async () => {
		mockGetPollForOrg.mockResolvedValue({
			...openPoll(),
			closesAt: new Date("2000-01-01T00:00:00Z"),
		});
		expect(await call(votePoll, INPUT, ctx)).toEqual({ ok: false, reason: "closed" });
	});
	it("rejects an option that doesn't belong to the poll", async () => {
		expect(await call(votePoll, { ...INPUT, optionId: "o9" }, ctx)).toEqual({
			ok: false,
			reason: "invalid_option",
		});
		expect(mockUpsertPollVote).not.toHaveBeenCalled();
	});
	it("returns not_found for a poll in another org (org scoping)", async () => {
		mockGetPollForOrg.mockResolvedValue(null);
		expect(await call(votePoll, INPUT, ctx)).toEqual({ ok: false, reason: "not_found" });
		expect(mockGetPollForOrg).toHaveBeenCalledWith({ organizationId: "org1", pollId: "p1" });
	});
	it("rejects non-members", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		expect(await call(votePoll, INPUT, ctx)).toEqual({ ok: false, reason: "not_member" });
	});
});
