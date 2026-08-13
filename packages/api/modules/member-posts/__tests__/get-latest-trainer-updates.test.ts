/**
 * getLatestTrainerUpdatesProcedure tests (S8-07) — the Pulse "Trainer
 * Updates" tile repointed at MemberPost. Verifies org-scope gating and that
 * the DB query args / response shaping match the spec (the published-horse,
 * trainer-only, org-scoped filtering itself lives in the mocked DB query).
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindFirst, mockListLatestTrainerUpdates } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockListLatestTrainerUpdates: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: { member: { findFirst: mockMemberFindFirst } },
	listLatestTrainerUpdates: mockListLatestTrainerUpdates,
}));

import { getLatestTrainerUpdatesProcedure } from "../procedures/get-latest-trainer-updates";

const MEMBER_USER = { id: "user-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: MEMBER_USER, session: SESSION });
});

describe("getLatestTrainerUpdatesProcedure", () => {
	it("returns shaped trainer updates for a member of the org", async () => {
		mockMemberFindFirst.mockResolvedValue({ id: "member-1" });
		const publishedAt = new Date("2026-08-01T00:00:00.000Z");
		mockListLatestTrainerUpdates.mockResolvedValue([
			{
				id: "mp-1",
				title: "Great work this week",
				bodyJson: {
					type: "doc",
					content: [{ type: "paragraph", content: [{ type: "text", text: "Going well." }] }],
				},
				publishedAt,
				horseId: "h-1",
				horse: { id: "h-1", name: "Storm Chaser" },
			},
		]);

		const res = await call(
			getLatestTrainerUpdatesProcedure,
			{ organizationId: "org-1", limit: 3 },
			ctx,
		);

		expect(mockMemberFindFirst).toHaveBeenCalledWith({
			where: { organizationId: "org-1", userId: "user-1" },
			select: { id: true },
		});
		expect(mockListLatestTrainerUpdates).toHaveBeenCalledWith({
			organizationId: "org-1",
			limit: 3,
		});
		expect(res).toEqual([
			{
				id: "mp-1",
				horseId: "h-1",
				horseName: "Storm Chaser",
				title: "Great work this week",
				bodyText: "Going well.",
				publishedAt,
			},
		]);
	});

	it("defaults limit to 3 when omitted", async () => {
		mockMemberFindFirst.mockResolvedValue({ id: "member-1" });
		mockListLatestTrainerUpdates.mockResolvedValue([]);

		await call(getLatestTrainerUpdatesProcedure, { organizationId: "org-1" }, ctx);

		expect(mockListLatestTrainerUpdates).toHaveBeenCalledWith({
			organizationId: "org-1",
			limit: 3,
		});
	});

	it("throws FORBIDDEN when the caller is not a member of the org", async () => {
		mockMemberFindFirst.mockResolvedValue(null);

		await expect(
			call(getLatestTrainerUpdatesProcedure, { organizationId: "org-1" }, ctx),
		).rejects.toThrow();
		expect(mockListLatestTrainerUpdates).not.toHaveBeenCalled();
	});

	it("drops rows with no horse relation (defensive — filtered at the DB layer already)", async () => {
		mockMemberFindFirst.mockResolvedValue({ id: "member-1" });
		mockListLatestTrainerUpdates.mockResolvedValue([
			{
				id: "mp-orphan",
				title: "Orphan",
				bodyJson: {},
				publishedAt: new Date("2026-08-01T00:00:00.000Z"),
				horseId: null,
				horse: null,
			},
		]);

		const res = await call(getLatestTrainerUpdatesProcedure, { organizationId: "org-1" }, ctx);

		expect(res).toEqual([]);
	});
});
