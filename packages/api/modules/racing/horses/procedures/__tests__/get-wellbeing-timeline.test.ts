import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockFindFirst, mockListPublishedWellbeingTimeline } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockFindFirst: vi.fn(),
	mockListPublishedWellbeingTimeline: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: { horse: { findFirst: mockFindFirst } },
}));

vi.mock("../../lib/wellbeing-updates", () => ({
	listPublishedWellbeingTimeline: mockListPublishedWellbeingTimeline,
}));

import { getWellbeingTimelineProcedure } from "../get-wellbeing-timeline";

const MEMBER = { id: "member-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: MEMBER, session: SESSION });
});

describe("getWellbeingTimelineProcedure", () => {
	it("returns the published timeline for a published horse in the caller's org", async () => {
		mockFindFirst.mockResolvedValue({ id: "h-1" });
		mockListPublishedWellbeingTimeline.mockResolvedValue([
			{ id: "w-1", publishedAt: new Date() },
		]);

		const res = await call(getWellbeingTimelineProcedure, { horseId: "h-1" }, ctx);

		expect(mockFindFirst).toHaveBeenCalledWith({
			where: { id: "h-1", organizationId: "org-1", publishedAt: { not: null } },
			select: { id: true },
		});
		expect(mockListPublishedWellbeingTimeline).toHaveBeenCalledWith({
			organizationId: "org-1",
			horseId: "h-1",
		});
		expect(res).toEqual([{ id: "w-1", publishedAt: expect.any(Date) }]);
	});

	it("throws NOT_FOUND for a horse not published in this org", async () => {
		mockFindFirst.mockResolvedValue(null);

		await expect(
			call(getWellbeingTimelineProcedure, { horseId: "h-1" }, ctx),
		).rejects.toThrow();
		expect(mockListPublishedWellbeingTimeline).not.toHaveBeenCalled();
	});
});
