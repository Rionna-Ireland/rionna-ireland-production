import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUnique, mockResolveFlag, mockDeletePost, mockDeleteComment } = vi.hoisted(() => ({
	mockFindUnique: vi.fn(),
	mockResolveFlag: vi.fn(),
	mockDeletePost: vi.fn(),
	mockDeleteComment: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: { moderationFlag: { findUnique: mockFindUnique }, organization: { findUnique: vi.fn() } },
	resolveModerationFlag: mockResolveFlag,
	markCommunityPostDeleted: vi.fn(),
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() } }));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: () => ({ deletePost: mockDeletePost, deleteComment: mockDeleteComment }),
}));
vi.mock("../../inbox/activity-hooks", () => ({ onCommunityPostRemoved: vi.fn() }));

import { runResolveModeration } from "../procedures/admin/resolve-moderation";

const ATTENTION = { id: "att1", organizationId: "org1", status: "open", source: "attention", surface: "member", targetPostId: null, targetCommentId: null };

beforeEach(() => {
	vi.clearAllMocks();
	mockFindUnique.mockResolvedValue(ATTENTION);
});

describe("resolveModeration on attention items (S12-08)", () => {
	it("dismisses an attention item without touching Circle", async () => {
		mockResolveFlag.mockResolvedValue({ ...ATTENTION, status: "dismissed" });
		expect(await runResolveModeration({ organizationId: "org1", flagId: "att1", action: "dismiss" }, "admin1")).toEqual({ ok: true, status: "dismissed" });
		expect(mockDeletePost).not.toHaveBeenCalled();
		expect(mockDeleteComment).not.toHaveBeenCalled();
	});

	it("refuses delete on an attention item (no target)", async () => {
		expect(await runResolveModeration({ organizationId: "org1", flagId: "att1", action: "delete" }, "admin1")).toEqual({ ok: false, status: "open" });
		expect(mockDeleteComment).not.toHaveBeenCalled();
		expect(mockResolveFlag).not.toHaveBeenCalled();
	});
});
