import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockUpsert,
	mockDeleteMany,
	mockMemberFindFirst,
	mockHorseFindFirst,
	mockOrgFindUnique,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockUpsert: vi.fn(),
	mockDeleteMany: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockHorseFindFirst: vi.fn(),
	mockOrgFindUnique: vi.fn(),
}));
vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		horseFollow: { upsert: mockUpsert, deleteMany: mockDeleteMany },
		member: { findFirst: mockMemberFindFirst },
		horse: { findFirst: mockHorseFindFirst },
		organization: { findUnique: mockOrgFindUnique },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));

const { mockSyncCircleSpaceMembership } = vi.hoisted(() => ({
	mockSyncCircleSpaceMembership: vi.fn(),
}));
vi.mock("@repo/payments/lib/circle-space-membership", () => ({
	syncCircleSpaceMembership: mockSyncCircleSpaceMembership,
}));

const { mockInvalidateFeedCache } = vi.hoisted(() => ({
	mockInvalidateFeedCache: vi.fn(),
}));
vi.mock("../../../../circle/lib/member-feed-cache", () => ({
	invalidateMemberFeedCache: mockInvalidateFeedCache,
}));

import { followHorseProcedure, unfollowHorseProcedure } from "../follow-horse";

const USER = { id: "u-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockUpsert.mockResolvedValue({ id: "hf-1" });
	mockDeleteMany.mockResolvedValue({ count: 1 });
	mockMemberFindFirst.mockResolvedValue({ id: "m-1" });
	mockHorseFindFirst.mockResolvedValue({ id: "h-1", inviteOnly: false });
	mockOrgFindUnique.mockResolvedValue({ metadata: null });
	mockSyncCircleSpaceMembership.mockResolvedValue({ ok: true });
});

describe("followHorseProcedure", () => {
	it("follows the horse for the current user + active org", async () => {
		const res = await call(followHorseProcedure, { horseId: "h-1" }, ctx);
		expect(mockUpsert).toHaveBeenCalledWith({
			where: { userId_horseId: { userId: "u-1", horseId: "h-1" } },
			create: { organizationId: "org-1", userId: "u-1", horseId: "h-1" },
			update: {},
		});
		expect(res).toEqual({ ok: true, isFollowing: true });
	});

	it("invalidates the member's feed buffer so the filter change is visible immediately", async () => {
		await call(followHorseProcedure, { horseId: "h-1" }, ctx);
		expect(mockInvalidateFeedCache).toHaveBeenCalledWith("u-1", "org-1");
	});
});

describe("unfollowHorseProcedure", () => {
	it("unfollows for the current user", async () => {
		const res = await call(unfollowHorseProcedure, { horseId: "h-1" }, ctx);
		expect(mockDeleteMany).toHaveBeenCalled();
		expect(res).toEqual({ ok: true, isFollowing: false });
	});

	it("invalidates the member's feed buffer so the filter change is visible immediately", async () => {
		await call(unfollowHorseProcedure, { horseId: "h-1" }, ctx);
		expect(mockInvalidateFeedCache).toHaveBeenCalledWith("u-1", "org-1");
	});
});

describe("input organizationId (web dashboard — session has no active org)", () => {
	beforeEach(() => {
		mockGetSession.mockResolvedValue({
			user: USER,
			session: { id: "s1", activeOrganizationId: null },
		});
	});

	it("follows using the input organizationId when the session has none", async () => {
		const res = await call(
			followHorseProcedure,
			{ horseId: "h-1", organizationId: "org-1" },
			ctx,
		);
		expect(mockMemberFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { organizationId: "org-1", userId: "u-1" } }),
		);
		expect(mockUpsert).toHaveBeenCalledWith({
			where: { userId_horseId: { userId: "u-1", horseId: "h-1" } },
			create: { organizationId: "org-1", userId: "u-1", horseId: "h-1" },
			update: {},
		});
		expect(res).toEqual({ ok: true, isFollowing: true });
	});

	it("unfollows using the input organizationId when the session has none", async () => {
		const res = await call(
			unfollowHorseProcedure,
			{ horseId: "h-1", organizationId: "org-1" },
			ctx,
		);
		expect(mockDeleteMany).toHaveBeenCalled();
		expect(res).toEqual({ ok: true, isFollowing: false });
	});

	it("rejects when the caller is not a member of that organization", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		await expect(
			call(followHorseProcedure, { horseId: "h-1", organizationId: "org-other" }, ctx),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it("rejects when the horse does not belong to that organization", async () => {
		mockHorseFindFirst.mockResolvedValue(null);
		await expect(
			call(followHorseProcedure, { horseId: "h-other", organizationId: "org-1" }, ctx),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it("still rejects when neither input nor session provides an organization", async () => {
		await expect(call(followHorseProcedure, { horseId: "h-1" }, ctx)).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});

describe("S8-04 §5 kill-switch", () => {
	beforeEach(() => {
		mockOrgFindUnique.mockResolvedValue({
			metadata: JSON.stringify({ features: { horseFollows: false } }),
		});
	});

	it("followHorseProcedure returns ok:false, disabled:true — no DB write, no cache invalidation", async () => {
		const res = await call(followHorseProcedure, { horseId: "h-1" }, ctx);
		expect(res).toEqual({ ok: false, disabled: true });
		expect(mockUpsert).not.toHaveBeenCalled();
		expect(mockInvalidateFeedCache).not.toHaveBeenCalled();
	});

	it("unfollowHorseProcedure returns ok:false, disabled:true — no DB write, no cache invalidation", async () => {
		const res = await call(unfollowHorseProcedure, { horseId: "h-1" }, ctx);
		expect(res).toEqual({ ok: false, disabled: true });
		expect(mockDeleteMany).not.toHaveBeenCalled();
		expect(mockInvalidateFeedCache).not.toHaveBeenCalled();
	});
});

describe("invite-only horse gating (S9-05)", () => {
	beforeEach(() => {
		mockHorseFindFirst.mockResolvedValue({ id: "h-1", inviteOnly: true });
	});

	it("followHorseProcedure returns ok:false, inviteOnly:true — no DB write, no Circle sync, no cache invalidation", async () => {
		const res = await call(followHorseProcedure, { horseId: "h-1" }, ctx);
		expect(res).toEqual({ ok: false, inviteOnly: true });
		expect(mockUpsert).not.toHaveBeenCalled();
		expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
		expect(mockInvalidateFeedCache).not.toHaveBeenCalled();
	});

	it("unfollowHorseProcedure is NOT gated — still unfollows on an invite-only horse", async () => {
		const res = await call(unfollowHorseProcedure, { horseId: "h-1" }, ctx);
		expect(res).toEqual({ ok: true, isFollowing: false });
		expect(mockDeleteMany).toHaveBeenCalled();
		expect(mockInvalidateFeedCache).toHaveBeenCalledWith("u-1", "org-1");
	});
});
