import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockFindFirst, mockListPublishedHorseUpdates } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockFindFirst: vi.fn(),
	mockListPublishedHorseUpdates: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: { horse: { findFirst: mockFindFirst } },
	listPublishedHorseUpdates: mockListPublishedHorseUpdates,
}));

import { getHorseUpdatesProcedure } from "../get-horse-updates";

const MEMBER = { id: "member-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: MEMBER, session: SESSION });
});

describe("getHorseUpdatesProcedure", () => {
	it("returns the published updates for a published horse in the caller's org, shaped for members", async () => {
		mockFindFirst.mockResolvedValue({ id: "h-1" });
		const publishedAt = new Date("2026-08-01T00:00:00.000Z");
		mockListPublishedHorseUpdates.mockResolvedValue([
			{
				id: "mp-1",
				updateType: "race",
				title: "Cheltenham entry confirmed",
				bodyJson: {
					type: "doc",
					content: [
						{ type: "paragraph", content: [{ type: "text", text: "Running Saturday." }] },
					],
				},
				publishedAt,
				circlePostId: "circle-1",
			},
		]);

		const res = await call(getHorseUpdatesProcedure, { horseId: "h-1" }, ctx);

		expect(mockFindFirst).toHaveBeenCalledWith({
			where: { id: "h-1", organizationId: "org-1", publishedAt: { not: null } },
			select: { id: true },
		});
		expect(mockListPublishedHorseUpdates).toHaveBeenCalledWith({
			organizationId: "org-1",
			horseId: "h-1",
		});
		expect(res).toEqual([
			{
				id: "mp-1",
				updateType: "race",
				title: "Cheltenham entry confirmed",
				bodyText: "Running Saturday.",
				publishedAt,
				circlePostId: "circle-1",
			},
		]);
	});

	it("throws NOT_FOUND for a horse not published in this org", async () => {
		mockFindFirst.mockResolvedValue(null);

		await expect(call(getHorseUpdatesProcedure, { horseId: "h-1" }, ctx)).rejects.toThrow();
		expect(mockListPublishedHorseUpdates).not.toHaveBeenCalled();
	});
});
