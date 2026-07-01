import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetPublishedHorses, mockGetPublishedHorseById, mockHorseFollowFindMany } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetPublishedHorses: vi.fn(),
	mockGetPublishedHorseById: vi.fn(),
	mockHorseFollowFindMany: vi.fn(),
}));
vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: { horseFollow: { findMany: mockHorseFollowFindMany } },
	getPublishedHorses: mockGetPublishedHorses,
	getPublishedHorseById: mockGetPublishedHorseById,
}));

import { getPublishedHorse } from "../get-published-horse";
import { listPublishedHorses } from "../list-published-horses";

const USER = { id: "u-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
});

describe("listPublishedHorses", () => {
	it("annotates list horses with isFollowing", async () => {
		mockGetPublishedHorses.mockResolvedValue([
			{ id: "h-1", name: "A" },
			{ id: "h-2", name: "B" },
		]);
		mockHorseFollowFindMany.mockResolvedValue([{ horseId: "h-1" }]);

		const res = await call(listPublishedHorses, { organizationId: "org-1" }, ctx);

		expect(res.find((h) => h.id === "h-1")?.isFollowing).toBe(true);
		expect(res.find((h) => h.id === "h-2")?.isFollowing).toBe(false);
	});
});

describe("getPublishedHorse", () => {
	it("annotates detail horse with isFollowing", async () => {
		mockGetPublishedHorseById.mockResolvedValue({ id: "h-1", organizationId: "org-1", name: "A" });
		mockHorseFollowFindMany.mockResolvedValue([{ horseId: "h-1" }]);

		const res = await call(getPublishedHorse, { horseId: "h-1" }, ctx);

		expect(res.isFollowing).toBe(true);
	});

	it("returns isFollowing false when not followed", async () => {
		mockGetPublishedHorseById.mockResolvedValue({ id: "h-2", organizationId: "org-1", name: "B" });
		mockHorseFollowFindMany.mockResolvedValue([{ horseId: "h-1" }]);

		const res = await call(getPublishedHorse, { horseId: "h-2" }, ctx);

		expect(res.isFollowing).toBe(false);
	});
});
