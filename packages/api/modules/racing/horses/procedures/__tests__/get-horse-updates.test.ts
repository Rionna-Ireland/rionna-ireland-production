import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockFindFirst, mockListPublishedHorseUpdates, mockGetFollowedHorseIds } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockFindFirst: vi.fn(),
		mockListPublishedHorseUpdates: vi.fn(),
		mockGetFollowedHorseIds: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: { horse: { findFirst: mockFindFirst } },
	listPublishedHorseUpdates: mockListPublishedHorseUpdates,
}));

vi.mock("../../lib/horse-follows", () => ({
	getFollowedHorseIds: mockGetFollowedHorseIds,
}));

import { getHorseUpdatesProcedure } from "../get-horse-updates";

const MEMBER = { id: "member-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: MEMBER, session: SESSION });
	mockGetFollowedHorseIds.mockResolvedValue(new Set());
});

describe("getHorseUpdatesProcedure", () => {
	it("returns the published updates for a published horse in the caller's org, shaped for members", async () => {
		mockFindFirst.mockResolvedValue({ id: "h-1", inviteOnly: false });
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
			select: { id: true, inviteOnly: true },
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

describe("getHorseUpdatesProcedure (S9-05 invite-only gating)", () => {
	it("returns updates for an invite-only horse the caller follows", async () => {
		mockFindFirst.mockResolvedValue({ id: "h-1", inviteOnly: true });
		mockGetFollowedHorseIds.mockResolvedValue(new Set(["h-1"]));
		mockListPublishedHorseUpdates.mockResolvedValue([]);

		const res = await call(getHorseUpdatesProcedure, { horseId: "h-1" }, ctx);

		expect(res).toEqual([]);
		expect(mockListPublishedHorseUpdates).toHaveBeenCalled();
	});

	it("throws NOT_FOUND for an invite-only horse the caller does not follow", async () => {
		mockFindFirst.mockResolvedValue({ id: "h-1", inviteOnly: true });
		mockGetFollowedHorseIds.mockResolvedValue(new Set());

		await expect(call(getHorseUpdatesProcedure, { horseId: "h-1" }, ctx)).rejects.toThrow();
		expect(mockListPublishedHorseUpdates).not.toHaveBeenCalled();
	});

	it("throws an identical NOT_FOUND error for inaccessible-invite-only vs. nonexistent", async () => {
		mockFindFirst.mockResolvedValue({ id: "h-1", inviteOnly: true });
		mockGetFollowedHorseIds.mockResolvedValue(new Set());
		let inaccessibleErr: unknown;
		try {
			await call(getHorseUpdatesProcedure, { horseId: "h-1" }, ctx);
		} catch (e) {
			inaccessibleErr = e;
		}

		mockFindFirst.mockResolvedValue(null);
		let nonexistentErr: unknown;
		try {
			await call(getHorseUpdatesProcedure, { horseId: "h-nonexistent" }, ctx);
		} catch (e) {
			nonexistentErr = e;
		}

		expect((inaccessibleErr as { code?: string }).code).toBe(
			(nonexistentErr as { code?: string }).code,
		);
		expect((inaccessibleErr as Error).message).toBe((nonexistentErr as Error).message);
	});
});
