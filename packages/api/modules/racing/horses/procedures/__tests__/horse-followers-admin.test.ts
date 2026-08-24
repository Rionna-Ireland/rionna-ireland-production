import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockListHorseFollowers,
	mockFollowHorse,
	mockUnfollowHorse,
	mockFollowAllMembers,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockListHorseFollowers: vi.fn(),
	mockFollowHorse: vi.fn(),
	mockUnfollowHorse: vi.fn(),
	mockFollowAllMembers: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("../../lib/horse-follows", () => ({
	listHorseFollowers: mockListHorseFollowers,
	followHorse: mockFollowHorse,
	unfollowHorse: mockUnfollowHorse,
	followAllMembers: mockFollowAllMembers,
}));

const { mockInvalidateFeedCache, mockClearFeedCache } = vi.hoisted(() => ({
	mockInvalidateFeedCache: vi.fn(),
	mockClearFeedCache: vi.fn(),
}));
vi.mock("../../../../circle/lib/member-feed-cache", () => ({
	invalidateMemberFeedCache: mockInvalidateFeedCache,
	clearMemberFeedCache: mockClearFeedCache,
}));

import {
	addFollowerProcedure,
	followAllMembersProcedure,
	listFollowersProcedure,
	removeFollowerProcedure,
} from "../horse-followers-admin";

const USER = { id: "admin-1", role: "admin" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
});

describe("listFollowersProcedure", () => {
	it("delegates to listHorseFollowers with the active org and horseId, returning its rows", async () => {
		const rows = [
			{
				userId: "u-1",
				name: "Alice",
				email: "alice@example.com",
				followedAt: new Date("2026-01-01"),
			},
		];
		mockListHorseFollowers.mockResolvedValue(rows);

		const res = await call(listFollowersProcedure, { horseId: "h-1" }, ctx);

		expect(mockListHorseFollowers).toHaveBeenCalledWith({
			organizationId: "org-1",
			horseId: "h-1",
		});
		expect(res).toEqual(rows);
	});
});

describe("addFollowerProcedure", () => {
	it("delegates to followHorse with the active org, userId, and horseId", async () => {
		mockFollowHorse.mockResolvedValue({ ok: true });

		const res = await call(addFollowerProcedure, { horseId: "h-1", userId: "u-1" }, ctx);

		expect(mockFollowHorse).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "u-1",
			horseId: "h-1",
		});
		expect(res).toEqual({ ok: true });
	});

	it("invalidates the target member's feed buffer", async () => {
		mockFollowHorse.mockResolvedValue({ ok: true });
		await call(addFollowerProcedure, { horseId: "h-1", userId: "u-1" }, ctx);
		expect(mockInvalidateFeedCache).toHaveBeenCalledWith("u-1", "org-1");
	});

	it("S8-04 §5: returns ok:false, disabled:true and skips cache invalidation when horseFollows is disabled", async () => {
		mockFollowHorse.mockResolvedValue({ ok: false, disabled: true });
		const res = await call(addFollowerProcedure, { horseId: "h-1", userId: "u-1" }, ctx);
		expect(res).toEqual({ ok: false, disabled: true });
		expect(mockInvalidateFeedCache).not.toHaveBeenCalled();
	});
});

describe("removeFollowerProcedure", () => {
	it("delegates to unfollowHorse with the active org, userId, and horseId", async () => {
		mockUnfollowHorse.mockResolvedValue({ ok: true });

		const res = await call(removeFollowerProcedure, { horseId: "h-1", userId: "u-1" }, ctx);

		expect(mockUnfollowHorse).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "u-1",
			horseId: "h-1",
		});
		expect(res).toEqual({ ok: true });
	});

	it("invalidates the target member's feed buffer", async () => {
		mockUnfollowHorse.mockResolvedValue({ ok: true });
		await call(removeFollowerProcedure, { horseId: "h-1", userId: "u-1" }, ctx);
		expect(mockInvalidateFeedCache).toHaveBeenCalledWith("u-1", "org-1");
	});

	it("S8-04 §5: returns ok:false, disabled:true and skips cache invalidation when horseFollows is disabled", async () => {
		mockUnfollowHorse.mockResolvedValue({ ok: false, disabled: true });
		const res = await call(removeFollowerProcedure, { horseId: "h-1", userId: "u-1" }, ctx);
		expect(res).toEqual({ ok: false, disabled: true });
		expect(mockInvalidateFeedCache).not.toHaveBeenCalled();
	});
});

describe("followAllMembersProcedure feed-cache clearing", () => {
	it("clears the whole feed cache — every member's filter changed", async () => {
		mockFollowAllMembers.mockResolvedValue({ followed: 3, joined: 3, failed: 0 });
		await call(followAllMembersProcedure, { horseId: "h-1" }, ctx);
		expect(mockClearFeedCache).toHaveBeenCalled();
	});

	it("S8-04 §5: skips the cache clear when the result is disabled (nothing changed)", async () => {
		mockFollowAllMembers.mockResolvedValue({ added: 0, disabled: true });
		const res = await call(followAllMembersProcedure, { horseId: "h-1" }, ctx);
		expect(mockClearFeedCache).not.toHaveBeenCalled();
		expect(res).toEqual({ added: 0, disabled: true });
	});
});

describe("followAllMembersProcedure", () => {
	it("delegates to followAllMembers and returns its result", async () => {
		mockFollowAllMembers.mockResolvedValue({ added: 7 });

		const res = await call(followAllMembersProcedure, { horseId: "h-1" }, ctx);

		expect(mockFollowAllMembers).toHaveBeenCalledWith({
			organizationId: "org-1",
			horseId: "h-1",
		});
		expect(res).toEqual({ added: 7 });
	});
});

describe("invite-only horse admin bypass (S9-05 regression)", () => {
	it("addFollowerProcedure still creates the follow on an invite-only horse — admin add is the invite mechanism", async () => {
		mockFollowHorse.mockResolvedValue({ ok: true });

		const res = await call(
			addFollowerProcedure,
			{ horseId: "h-invite-only", userId: "u-1" },
			ctx,
		);

		expect(mockFollowHorse).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "u-1",
			horseId: "h-invite-only",
		});
		expect(res).toEqual({ ok: true });
	});

	it("removeFollowerProcedure still removes the follow on an invite-only horse", async () => {
		mockUnfollowHorse.mockResolvedValue({ ok: true });

		const res = await call(
			removeFollowerProcedure,
			{ horseId: "h-invite-only", userId: "u-1" },
			ctx,
		);

		expect(mockUnfollowHorse).toHaveBeenCalledWith({
			organizationId: "org-1",
			userId: "u-1",
			horseId: "h-invite-only",
		});
		expect(res).toEqual({ ok: true });
	});
});
