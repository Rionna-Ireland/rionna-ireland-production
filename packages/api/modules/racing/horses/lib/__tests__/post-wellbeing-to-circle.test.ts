/**
 * S8-01 Amendment A1: postWellbeingToCircle / deleteWellbeingCirclePost tests.
 *
 * Fail-safe, mirrors post-to-circle.test.ts (S6-08): never throws, only
 * persists circlePostId when the Circle post actually succeeds, and skips
 * silently when the horse's space isn't active or the org has no slug.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockHorseFindFirst = vi.fn();
const mockOrganizationFindUnique = vi.fn();
const mockHorseWellbeingUpdateUpdate = vi.fn().mockResolvedValue({});
const mockHorseWellbeingUpdateFindUnique = vi.fn();

vi.mock("@repo/database", () => ({
	db: {
		horse: { findFirst: (...args: unknown[]) => mockHorseFindFirst(...args) },
		organization: { findUnique: (...args: unknown[]) => mockOrganizationFindUnique(...args) },
		horseWellbeingUpdate: {
			update: (...args: unknown[]) => mockHorseWellbeingUpdateUpdate(...args),
			findUnique: (...args: unknown[]) => mockHorseWellbeingUpdateFindUnique(...args),
		},
	},
}));

const mockCreatePost = vi.fn();
const mockDeletePost = vi.fn();
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({
		createPost: (...args: unknown[]) => mockCreatePost(...args),
		deletePost: (...args: unknown[]) => mockDeletePost(...args),
	})),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { deleteWellbeingCirclePost, postWellbeingToCircle } from "../post-wellbeing-to-circle";

function baseInput(overrides: Partial<Parameters<typeof postWellbeingToCircle>[0]> = {}) {
	return {
		organizationId: "org-1",
		updateId: "w-1",
		horseId: "h-1",
		type: "VET" as const,
		body: "Routine checkup, all clear.",
		...overrides,
	};
}

describe("postWellbeingToCircle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockHorseFindFirst.mockResolvedValue({
			name: "My Boy Harry",
			circleSpaceId: "space-1",
			circleSpaceStatus: "active",
		});
		mockOrganizationFindUnique.mockResolvedValue({ slug: "the-club" });
		mockCreatePost.mockResolvedValue({ ok: true, data: { circlePostId: "post-1" } });
		mockHorseWellbeingUpdateFindUnique.mockResolvedValue({ circlePostId: null });
	});

	it("skips creating a second post when the row already has a circlePostId (republish)", async () => {
		mockHorseWellbeingUpdateFindUnique.mockResolvedValue({ circlePostId: "post-existing" });

		await postWellbeingToCircle(baseInput());

		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockHorseWellbeingUpdateUpdate).not.toHaveBeenCalled();
	});

	it("creates the post and persists circlePostId when the space is active", async () => {
		await postWellbeingToCircle(baseInput());

		expect(mockCreatePost).toHaveBeenCalledOnce();
		const call = mockCreatePost.mock.calls[0][0];
		expect(call.spaceId).toBe("space-1");
		expect(call.name).toBe("My Boy Harry — wellbeing update: Vet");
		expect(call.idempotencyKey).toBe("wellbeing:w-1");

		expect(mockHorseWellbeingUpdateUpdate).toHaveBeenCalledWith({
			where: { id: "w-1" },
			data: { circlePostId: "post-1" },
		});
	});

	it("skips silently when the horse has no active Circle space", async () => {
		mockHorseFindFirst.mockResolvedValue({
			name: "My Boy Harry",
			circleSpaceId: null,
			circleSpaceStatus: null,
		});

		await postWellbeingToCircle(baseInput());

		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockHorseWellbeingUpdateUpdate).not.toHaveBeenCalled();
	});

	it("skips silently when the space exists but isn't active", async () => {
		mockHorseFindFirst.mockResolvedValue({
			name: "My Boy Harry",
			circleSpaceId: "space-1",
			circleSpaceStatus: "provisioning_failed",
		});

		await postWellbeingToCircle(baseInput());

		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockHorseWellbeingUpdateUpdate).not.toHaveBeenCalled();
	});

	it("skips silently when the org has no slug", async () => {
		mockOrganizationFindUnique.mockResolvedValue({ slug: null });

		await postWellbeingToCircle(baseInput());

		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockHorseWellbeingUpdateUpdate).not.toHaveBeenCalled();
	});

	it("does not persist circlePostId when createPost fails, and never throws", async () => {
		mockCreatePost.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });

		await expect(postWellbeingToCircle(baseInput())).resolves.toBeUndefined();
		expect(mockHorseWellbeingUpdateUpdate).not.toHaveBeenCalled();
	});

	it("never throws even when createPost rejects", async () => {
		mockCreatePost.mockRejectedValue(new Error("network down"));

		await expect(postWellbeingToCircle(baseInput())).resolves.toBeUndefined();
		expect(mockHorseWellbeingUpdateUpdate).not.toHaveBeenCalled();
	});

	it("never throws when the horse lookup itself rejects", async () => {
		mockHorseFindFirst.mockRejectedValue(new Error("db unavailable"));

		await expect(postWellbeingToCircle(baseInput())).resolves.toBeUndefined();
	});
});

describe("deleteWellbeingCirclePost", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockOrganizationFindUnique.mockResolvedValue({ slug: "the-club" });
		mockDeletePost.mockResolvedValue({ ok: true, data: undefined });
	});

	it("calls deletePost with the stored circlePostId", async () => {
		await deleteWellbeingCirclePost({ organizationId: "org-1", circlePostId: "post-1" });

		expect(mockDeletePost).toHaveBeenCalledWith("post-1");
	});

	it("never throws when Circle rejects the delete", async () => {
		mockDeletePost.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });

		await expect(
			deleteWellbeingCirclePost({ organizationId: "org-1", circlePostId: "post-1" }),
		).resolves.toBeUndefined();
	});

	it("never throws when deletePost rejects", async () => {
		mockDeletePost.mockRejectedValue(new Error("network down"));

		await expect(
			deleteWellbeingCirclePost({ organizationId: "org-1", circlePostId: "post-1" }),
		).resolves.toBeUndefined();
	});

	it("skips silently when the org has no slug", async () => {
		mockOrganizationFindUnique.mockResolvedValue({ slug: null });

		await deleteWellbeingCirclePost({ organizationId: "org-1", circlePostId: "post-1" });

		expect(mockDeletePost).not.toHaveBeenCalled();
	});
});
