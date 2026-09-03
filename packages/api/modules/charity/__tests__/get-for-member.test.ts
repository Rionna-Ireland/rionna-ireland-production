import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession, mockOrgFindUnique, mockMemberFindFirst,
	mockGetCurrentCharityConfig, mockGetPublishedCharityStories, mockGetPollForOrg,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(), mockOrgFindUnique: vi.fn(), mockMemberFindFirst: vi.fn(),
	mockGetCurrentCharityConfig: vi.fn(), mockGetPublishedCharityStories: vi.fn(), mockGetPollForOrg: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: { organization: { findUnique: mockOrgFindUnique }, member: { findFirst: mockMemberFindFirst } },
	getCurrentCharityConfig: mockGetCurrentCharityConfig,
	getPublishedCharityStories: mockGetPublishedCharityStories,
	getPollForOrg: mockGetPollForOrg,
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() } }));

import { getForMember } from "../procedures/get-for-member";

const USER = { id: "u1", role: "user", name: "Jane" };
const ctx = { context: { headers: new Headers() } };
const CONFIG = {
	id: "c1", organizationId: "org1", charityName: "Irish Injured Jockeys", description: "Support.",
	logoUrl: null, websiteUrl: null, percentage: { toNumber: () => 5 }, startDate: new Date("2026-03-01"),
	endedAt: null, goalCents: null, manualOverrideCents: null, pollId: null,
	stripeRevenueCents: 100_000, revenueSyncedAt: null, currency: "EUR",
};
const STORY = { id: "n1", slug: "six-horses-retrained", title: "Six horses retrained", subtitle: null, featuredImageUrl: null, publishedAt: new Date("2026-08-01T00:00:00Z") };
const OPEN_POLL = { id: "p1", organizationId: "org1", question: "Next cause?", scope: "club", circleSpaceId: null, status: "open", publishedAt: new Date("2026-08-20"), closesAt: null, options: [] };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: USER });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", metadata: null });
	mockMemberFindFirst.mockResolvedValue({ id: "m1" });
	mockGetCurrentCharityConfig.mockResolvedValue(CONFIG);
	mockGetPublishedCharityStories.mockResolvedValue([STORY]);
	mockGetPollForOrg.mockResolvedValue(null);
});

describe("charity.getForMember", () => {
	it("returns the computed view with story teasers and no poll", async () => {
		const result = await call(getForMember, { organizationId: "org1" }, ctx);
		expect(result).toEqual({
			ok: true,
			charity: expect.objectContaining({
				charityName: "Irish Injured Jockeys",
				percentage: 5,
				totalCents: 5_000,
				goalProgress: null,
				stories: [{ id: "n1", slug: "six-horses-retrained", title: "Six horses retrained", subtitle: null, featuredImageUrl: null, publishedAt: "2026-08-01T00:00:00.000Z" }],
				pollId: null,
			}),
		});
		expect(mockGetPublishedCharityStories).toHaveBeenCalledWith({ organizationId: "org1", limit: 10 });
		expect(mockGetPollForOrg).not.toHaveBeenCalled();
	});
	it("passes the linked poll id through when the poll is published", async () => {
		mockGetCurrentCharityConfig.mockResolvedValue({ ...CONFIG, pollId: "p1" });
		mockGetPollForOrg.mockResolvedValue(OPEN_POLL);
		const result = await call(getForMember, { organizationId: "org1" }, ctx);
		expect(result.charity?.pollId).toBe("p1");
		expect(mockGetPollForOrg).toHaveBeenCalledWith({ organizationId: "org1", pollId: "p1" });
	});
	it("drops a linked poll that is missing, still a draft, or space-scoped", async () => {
		mockGetCurrentCharityConfig.mockResolvedValue({ ...CONFIG, pollId: "p1" });
		mockGetPollForOrg.mockResolvedValue(null);
		expect((await call(getForMember, { organizationId: "org1" }, ctx)).charity?.pollId).toBeNull();
		mockGetPollForOrg.mockResolvedValue({ ...OPEN_POLL, status: "draft", publishedAt: null });
		expect((await call(getForMember, { organizationId: "org1" }, ctx)).charity?.pollId).toBeNull();
		mockGetPollForOrg.mockResolvedValue({ ...OPEN_POLL, scope: "space", circleSpaceId: "space-1" });
		expect((await call(getForMember, { organizationId: "org1" }, ctx)).charity?.pollId).toBeNull();
	});
	it("returns null charity when there is no current config", async () => {
		mockGetCurrentCharityConfig.mockResolvedValue(null);
		expect(await call(getForMember, { organizationId: "org1" }, ctx)).toEqual({ ok: true, charity: null });
	});
	it("returns null for non-members and when features.paddock is false", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		expect(await call(getForMember, { organizationId: "org1" }, ctx)).toEqual({ ok: true, charity: null });
		mockMemberFindFirst.mockResolvedValue({ id: "m1" });
		mockOrgFindUnique.mockResolvedValue({ id: "org1", metadata: JSON.stringify({ features: { paddock: false } }) });
		expect(await call(getForMember, { organizationId: "org1" }, ctx)).toEqual({ ok: true, charity: null });
	});
});
