import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockModerationFlagFindUnique,
	mockOrgFindUnique,
	mockResolveModerationFlag,
	mockMarkCommunityPostDeleted,
	mockDeletePost,
	mockDeleteComment,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockModerationFlagFindUnique: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockResolveModerationFlag: vi.fn(),
	mockMarkCommunityPostDeleted: vi.fn(),
	mockDeletePost: vi.fn(),
	mockDeleteComment: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		moderationFlag: { findUnique: mockModerationFlagFindUnique },
		organization: { findUnique: mockOrgFindUnique },
	},
	resolveModerationFlag: mockResolveModerationFlag,
	markCommunityPostDeleted: mockMarkCommunityPostDeleted,
}));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: () => ({ deletePost: mockDeletePost, deleteComment: mockDeleteComment }),
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { resolveModeration } from "../procedures/admin/resolve-moderation";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const ORG_ID = "org1";
const FLAG_ID = "flag1";

const openPostFlag = {
	id: FLAG_ID,
	organizationId: ORG_ID,
	source: "reported",
	surface: "post",
	memberId: "m1",
	targetPostId: "post-1",
	targetCommentId: null,
	status: "open",
};

const openCommentFlag = {
	...openPostFlag,
	surface: "comment",
	targetPostId: null,
	targetCommentId: "comment-1",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockOrgFindUnique.mockResolvedValue({ slug: "rionna" });
});

describe("admin.community.moderation.resolve (S12-02a)", () => {
	it("dismiss: transitions to dismissed with no Circle call", async () => {
		mockModerationFlagFindUnique.mockResolvedValue(openPostFlag);
		mockResolveModerationFlag.mockResolvedValue({ ...openPostFlag, status: "dismissed" });

		const result = await call(
			resolveModeration,
			{ organizationId: ORG_ID, flagId: FLAG_ID, action: "dismiss" },
			ctx,
		);

		expect(result).toEqual({ ok: true, status: "dismissed" });
		expect(mockDeletePost).not.toHaveBeenCalled();
		expect(mockDeleteComment).not.toHaveBeenCalled();
		expect(mockResolveModerationFlag).toHaveBeenCalledWith({
			id: FLAG_ID,
			organizationId: ORG_ID,
			status: "dismissed",
			resolvedByUserId: ADMIN.id,
		});
	});

	it("delete on a post row: deletes via Circle then marks the CommunityPost row deleted", async () => {
		mockModerationFlagFindUnique.mockResolvedValue(openPostFlag);
		mockDeletePost.mockResolvedValue({ ok: true, data: undefined });
		mockResolveModerationFlag.mockResolvedValue({ ...openPostFlag, status: "deleted" });

		const result = await call(
			resolveModeration,
			{ organizationId: ORG_ID, flagId: FLAG_ID, action: "delete" },
			ctx,
		);

		expect(mockDeletePost).toHaveBeenCalledWith("post-1");
		expect(mockMarkCommunityPostDeleted).toHaveBeenCalledWith({
			circlePostId: "post-1",
			deletedBy: "admin",
		});
		expect(result).toEqual({ ok: true, status: "deleted" });
	});

	it("delete on a comment row: deletes via Circle deleteComment (Admin v2)", async () => {
		mockModerationFlagFindUnique.mockResolvedValue(openCommentFlag);
		mockDeleteComment.mockResolvedValue({ ok: true, data: undefined });
		mockResolveModerationFlag.mockResolvedValue({ ...openCommentFlag, status: "deleted" });

		const result = await call(
			resolveModeration,
			{ organizationId: ORG_ID, flagId: FLAG_ID, action: "delete" },
			ctx,
		);

		expect(mockDeleteComment).toHaveBeenCalledWith("comment-1");
		expect(mockMarkCommunityPostDeleted).not.toHaveBeenCalled();
		expect(result).toEqual({ ok: true, status: "deleted" });
	});

	it("delete: a Circle not_found result counts as success and proceeds to mark deleted", async () => {
		mockModerationFlagFindUnique.mockResolvedValue(openCommentFlag);
		mockDeleteComment.mockResolvedValue({ ok: false, reason: "not_found", retriable: false });
		mockResolveModerationFlag.mockResolvedValue({ ...openCommentFlag, status: "deleted" });

		const result = await call(
			resolveModeration,
			{ organizationId: ORG_ID, flagId: FLAG_ID, action: "delete" },
			ctx,
		);

		expect(result).toEqual({ ok: true, status: "deleted" });
	});

	it("delete: a row missing its target post/comment id returns ok:false and stays open", async () => {
		mockModerationFlagFindUnique.mockResolvedValue({
			...openPostFlag,
			targetPostId: null,
		});

		const result = await call(
			resolveModeration,
			{ organizationId: ORG_ID, flagId: FLAG_ID, action: "delete" },
			ctx,
		);

		expect(result).toEqual({ ok: false, status: "open" });
		expect(mockDeletePost).not.toHaveBeenCalled();
		expect(mockResolveModerationFlag).not.toHaveBeenCalled();
	});

	it("delete: a Circle failure (not not_found) leaves the row open and returns ok:false", async () => {
		mockModerationFlagFindUnique.mockResolvedValue(openPostFlag);
		mockDeletePost.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });

		const result = await call(
			resolveModeration,
			{ organizationId: ORG_ID, flagId: FLAG_ID, action: "delete" },
			ctx,
		);

		expect(result).toEqual({ ok: false, status: "open" });
		expect(mockMarkCommunityPostDeleted).not.toHaveBeenCalled();
		expect(mockResolveModerationFlag).not.toHaveBeenCalled();
	});

	it("returns ok:false for an unknown flag id", async () => {
		mockModerationFlagFindUnique.mockResolvedValue(null);

		const result = await call(
			resolveModeration,
			{ organizationId: ORG_ID, flagId: "nope", action: "dismiss" },
			ctx,
		);

		expect(result).toEqual({ ok: false, status: "open" });
	});

	it("returns ok:false for a flag id belonging to another org", async () => {
		mockModerationFlagFindUnique.mockResolvedValue({ ...openPostFlag, organizationId: "other-org" });

		const result = await call(
			resolveModeration,
			{ organizationId: ORG_ID, flagId: FLAG_ID, action: "dismiss" },
			ctx,
		);

		expect(result).toEqual({ ok: false, status: "open" });
	});

	it("throws FORBIDDEN when organizationId does not match the caller's active org", async () => {
		await expect(
			call(resolveModeration, { organizationId: "other-org", flagId: FLAG_ID, action: "dismiss" }, ctx),
		).rejects.toThrow();
		expect(mockModerationFlagFindUnique).not.toHaveBeenCalled();
	});
});
