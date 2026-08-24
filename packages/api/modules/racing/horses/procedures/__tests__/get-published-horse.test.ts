import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetPublishedHorseById, mockGetFollowedHorseIds } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetPublishedHorseById: vi.fn(),
	mockGetFollowedHorseIds: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	getPublishedHorseById: mockGetPublishedHorseById,
}));

vi.mock("../../lib/horse-follows", () => ({
	getFollowedHorseIds: mockGetFollowedHorseIds,
}));

import { getPublishedHorse } from "../get-published-horse";

const MEMBER = { id: "user-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: MEMBER, session: SESSION });
});

describe("getPublishedHorse (S9-05 invite-only gating)", () => {
	it("returns an open horse regardless of follow state", async () => {
		mockGetPublishedHorseById.mockResolvedValue({
			id: "h-1",
			organizationId: "org-1",
			inviteOnly: false,
		});
		mockGetFollowedHorseIds.mockResolvedValue(new Set());

		const res = await call(getPublishedHorse, { horseId: "h-1" }, ctx);

		expect(res).toMatchObject({ id: "h-1", isFollowing: false });
	});

	it("returns an invite-only horse the caller follows", async () => {
		mockGetPublishedHorseById.mockResolvedValue({
			id: "h-1",
			organizationId: "org-1",
			inviteOnly: true,
		});
		mockGetFollowedHorseIds.mockResolvedValue(new Set(["h-1"]));

		const res = await call(getPublishedHorse, { horseId: "h-1" }, ctx);

		expect(res).toMatchObject({ id: "h-1", isFollowing: true });
	});

	it("throws NOT_FOUND for an invite-only horse the caller does not follow", async () => {
		mockGetPublishedHorseById.mockResolvedValue({
			id: "h-1",
			organizationId: "org-1",
			inviteOnly: true,
		});
		mockGetFollowedHorseIds.mockResolvedValue(new Set());

		await expect(call(getPublishedHorse, { horseId: "h-1" }, ctx)).rejects.toThrow();
	});

	it("throws an identical NOT_FOUND for a genuinely nonexistent horse", async () => {
		mockGetPublishedHorseById.mockResolvedValue(null);

		let inaccessibleErr: unknown;
		let nonexistentErr: unknown;
		try {
			mockGetPublishedHorseById.mockResolvedValue({
				id: "h-1",
				organizationId: "org-1",
				inviteOnly: true,
			});
			mockGetFollowedHorseIds.mockResolvedValue(new Set());
			await call(getPublishedHorse, { horseId: "h-1" }, ctx);
		} catch (e) {
			inaccessibleErr = e;
		}
		try {
			mockGetPublishedHorseById.mockResolvedValue(null);
			await call(getPublishedHorse, { horseId: "h-nonexistent" }, ctx);
		} catch (e) {
			nonexistentErr = e;
		}
		expect(inaccessibleErr).toBeInstanceOf(Error);
		expect(nonexistentErr).toBeInstanceOf(Error);
		expect((inaccessibleErr as { code?: string }).code).toBe(
			(nonexistentErr as { code?: string }).code,
		);
		expect((inaccessibleErr as Error).message).toBe((nonexistentErr as Error).message);
	});
});
