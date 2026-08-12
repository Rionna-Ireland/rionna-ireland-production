/**
 * S8-01 §3/§6: wellbeing timeline service.
 *
 * publish-with-notify fires a HORSE_WELLBEING push scoped to that horse's
 * followers only — every publish path (create-and-publish, publish-later)
 * must go through the same notifyFollowers helper.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockCreateWellbeingUpdate,
	mockGetWellbeingUpdateById,
	mockUpdateWellbeingUpdate,
	mockDeleteWellbeingUpdate,
	mockListWellbeingUpdatesForAdmin,
	mockListPublishedWellbeingUpdates,
	mockGetHorseById,
	mockSendPush,
	mockPostWellbeingToCircle,
	mockDeleteWellbeingCirclePost,
} = vi.hoisted(() => ({
	mockCreateWellbeingUpdate: vi.fn(),
	mockGetWellbeingUpdateById: vi.fn(),
	mockUpdateWellbeingUpdate: vi.fn(),
	mockDeleteWellbeingUpdate: vi.fn(),
	mockListWellbeingUpdatesForAdmin: vi.fn(),
	mockListPublishedWellbeingUpdates: vi.fn(),
	mockGetHorseById: vi.fn(),
	mockSendPush: vi.fn(),
	mockPostWellbeingToCircle: vi.fn(),
	mockDeleteWellbeingCirclePost: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	createWellbeingUpdate: mockCreateWellbeingUpdate,
	getWellbeingUpdateById: mockGetWellbeingUpdateById,
	updateWellbeingUpdate: mockUpdateWellbeingUpdate,
	deleteWellbeingUpdate: mockDeleteWellbeingUpdate,
	listWellbeingUpdatesForAdmin: mockListWellbeingUpdatesForAdmin,
	listPublishedWellbeingUpdates: mockListPublishedWellbeingUpdates,
	getHorseById: mockGetHorseById,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../../push/service", () => ({
	sendPush: mockSendPush,
}));

vi.mock("../post-wellbeing-to-circle", () => ({
	postWellbeingToCircle: mockPostWellbeingToCircle,
	deleteWellbeingCirclePost: mockDeleteWellbeingCirclePost,
}));

import {
	createWellbeingUpdate,
	deleteWellbeingUpdateById,
	publishWellbeingUpdate,
	updateWellbeingUpdateFields,
} from "../wellbeing-updates";

beforeEach(() => {
	vi.clearAllMocks();
	mockGetHorseById.mockResolvedValue({ id: "h-1", name: "Pink Diamond Lass" });
	mockSendPush.mockResolvedValue({ attempted: 1, sent: 1, failed: 0 });
	mockPostWellbeingToCircle.mockResolvedValue(undefined);
	mockDeleteWellbeingCirclePost.mockResolvedValue(undefined);
});

describe("createWellbeingUpdate", () => {
	it("creates a draft (publishedAt null) and never pushes or cross-posts when publish is omitted", async () => {
		mockCreateWellbeingUpdate.mockResolvedValue({
			id: "w-1",
			horseId: "h-1",
			organizationId: "org-1",
			type: "VET",
			body: "Routine checkup, all clear.",
			publishedAt: null,
		});

		await createWellbeingUpdate({
			organizationId: "org-1",
			horseId: "h-1",
			type: "VET",
			body: "Routine checkup, all clear.",
		});

		expect(mockCreateWellbeingUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ publishedAt: null, notifyMembers: false }),
		);
		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockPostWellbeingToCircle).not.toHaveBeenCalled();
	});

	it("publishes immediately, cross-posts, but does not push when notifyMembers is false (quiet publish)", async () => {
		mockCreateWellbeingUpdate.mockResolvedValue({
			id: "w-1",
			horseId: "h-1",
			organizationId: "org-1",
			type: "TRAINING",
			body: "Back cantering this week.",
			publishedAt: new Date(),
		});

		await createWellbeingUpdate({
			organizationId: "org-1",
			horseId: "h-1",
			type: "TRAINING",
			body: "Back cantering this week.",
			publish: true,
			notifyMembers: false,
		});

		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockPostWellbeingToCircle).toHaveBeenCalledWith({
			organizationId: "org-1",
			updateId: "w-1",
			horseId: "h-1",
			type: "TRAINING",
			body: "Back cantering this week.",
		});
	});

	it("publish + notifyMembers fires a HORSE_WELLBEING push scoped to the horse's followers, and cross-posts", async () => {
		mockCreateWellbeingUpdate.mockResolvedValue({
			id: "w-1",
			horseId: "h-1",
			organizationId: "org-1",
			type: "REHAB",
			body: "Progressing well in the pool.",
			publishedAt: new Date(),
		});

		await createWellbeingUpdate({
			organizationId: "org-1",
			horseId: "h-1",
			type: "REHAB",
			body: "Progressing well in the pool.",
			publish: true,
			notifyMembers: true,
		});

		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-1",
				triggerType: "HORSE_WELLBEING",
				triggerRefId: "w-1",
				followersOfHorseId: "h-1",
			}),
		);
		expect(mockPostWellbeingToCircle).toHaveBeenCalledWith({
			organizationId: "org-1",
			updateId: "w-1",
			horseId: "h-1",
			type: "REHAB",
			body: "Progressing well in the pool.",
		});
	});

	it("does not throw when the push delivery itself throws — the create already committed", async () => {
		mockCreateWellbeingUpdate.mockResolvedValue({
			id: "w-1",
			horseId: "h-1",
			organizationId: "org-1",
			type: "REHAB",
			body: "Progressing well in the pool.",
			publishedAt: new Date(),
		});
		mockSendPush.mockRejectedValue(new Error("db unavailable"));

		await expect(
			createWellbeingUpdate({
				organizationId: "org-1",
				horseId: "h-1",
				type: "REHAB",
				body: "Progressing well in the pool.",
				publish: true,
				notifyMembers: true,
			}),
		).resolves.toEqual(
			expect.objectContaining({ id: "w-1" }),
		);
	});
});

describe("publishWellbeingUpdate", () => {
	it("returns null when the update isn't owned by this org", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({
			id: "w-1",
			organizationId: "org-other",
			horseId: "h-1",
		});

		const result = await publishWellbeingUpdate({
			organizationId: "org-1",
			updateId: "w-1",
			notifyMembers: true,
		});

		expect(result).toBeNull();
		expect(mockUpdateWellbeingUpdate).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockPostWellbeingToCircle).not.toHaveBeenCalled();
	});

	it("sets publishedAt, fires a push, and cross-posts when notifyMembers is true", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({
			id: "w-1",
			organizationId: "org-1",
			horseId: "h-1",
			type: "REST",
			publishedAt: null,
		});
		mockUpdateWellbeingUpdate.mockResolvedValue({
			id: "w-1",
			organizationId: "org-1",
			horseId: "h-1",
			type: "REST",
			body: "Standing down for the week.",
			publishedAt: new Date(),
		});

		await publishWellbeingUpdate({
			organizationId: "org-1",
			updateId: "w-1",
			notifyMembers: true,
		});

		expect(mockUpdateWellbeingUpdate).toHaveBeenCalledWith(
			"w-1",
			expect.objectContaining({ notifyMembers: true }),
		);
		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({
				triggerType: "HORSE_WELLBEING",
				followersOfHorseId: "h-1",
				triggerRefId: "w-1",
			}),
		);
		expect(mockPostWellbeingToCircle).toHaveBeenCalledWith({
			organizationId: "org-1",
			updateId: "w-1",
			horseId: "h-1",
			type: "REST",
			body: "Standing down for the week.",
		});
	});

	it("cross-posts even when notifyMembers is false (quiet publish)", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({
			id: "w-1",
			organizationId: "org-1",
			horseId: "h-1",
			type: "VET",
			publishedAt: null,
		});
		mockUpdateWellbeingUpdate.mockResolvedValue({
			id: "w-1",
			organizationId: "org-1",
			horseId: "h-1",
			type: "VET",
			body: "All clear at the vet check.",
			publishedAt: new Date(),
		});

		await publishWellbeingUpdate({
			organizationId: "org-1",
			updateId: "w-1",
			notifyMembers: false,
		});

		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockPostWellbeingToCircle).toHaveBeenCalledWith({
			organizationId: "org-1",
			updateId: "w-1",
			horseId: "h-1",
			type: "VET",
			body: "All clear at the vet check.",
		});
	});

	it("does not move publishedAt for an already-published entry", async () => {
		const originalPublishedAt = new Date("2026-01-01T00:00:00.000Z");
		mockGetWellbeingUpdateById.mockResolvedValue({
			id: "w-1",
			organizationId: "org-1",
			horseId: "h-1",
			type: "VET",
			publishedAt: originalPublishedAt,
		});
		mockUpdateWellbeingUpdate.mockResolvedValue({});

		await publishWellbeingUpdate({
			organizationId: "org-1",
			updateId: "w-1",
			notifyMembers: false,
		});

		expect(mockUpdateWellbeingUpdate).toHaveBeenCalledWith(
			"w-1",
			expect.objectContaining({ publishedAt: originalPublishedAt }),
		);
	});

	it("does not push when notifyMembers is false", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({
			id: "w-1",
			organizationId: "org-1",
			horseId: "h-1",
			type: "VET",
			publishedAt: null,
		});
		mockUpdateWellbeingUpdate.mockResolvedValue({ id: "w-1" });

		await publishWellbeingUpdate({
			organizationId: "org-1",
			updateId: "w-1",
			notifyMembers: false,
		});

		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it("still returns the published row when the push delivery throws", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({
			id: "w-1",
			organizationId: "org-1",
			horseId: "h-1",
			type: "REST",
			publishedAt: null,
		});
		mockUpdateWellbeingUpdate.mockResolvedValue({
			id: "w-1",
			organizationId: "org-1",
			horseId: "h-1",
			type: "REST",
			publishedAt: new Date(),
		});
		mockSendPush.mockRejectedValue(new Error("db unavailable"));

		await expect(
			publishWellbeingUpdate({
				organizationId: "org-1",
				updateId: "w-1",
				notifyMembers: true,
			}),
		).resolves.toEqual(expect.objectContaining({ id: "w-1" }));
	});
});

describe("updateWellbeingUpdateFields", () => {
	it("returns null when the update isn't owned by this org", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({ id: "w-1", organizationId: "org-other" });

		const result = await updateWellbeingUpdateFields({
			organizationId: "org-1",
			updateId: "w-1",
			body: "edited",
		});

		expect(result).toBeNull();
		expect(mockUpdateWellbeingUpdate).not.toHaveBeenCalled();
	});

	it("updates fields when owned by this org", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({ id: "w-1", organizationId: "org-1" });
		mockUpdateWellbeingUpdate.mockResolvedValue({ id: "w-1", body: "edited" });

		const result = await updateWellbeingUpdateFields({
			organizationId: "org-1",
			updateId: "w-1",
			body: "edited",
		});

		expect(mockUpdateWellbeingUpdate).toHaveBeenCalledWith(
			"w-1",
			expect.objectContaining({ body: "edited" }),
		);
		expect(result).toEqual({ id: "w-1", body: "edited" });
	});
});

describe("deleteWellbeingUpdateById", () => {
	it("returns false and doesn't delete when not owned by this org", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({ id: "w-1", organizationId: "org-other" });

		const result = await deleteWellbeingUpdateById({
			organizationId: "org-1",
			updateId: "w-1",
		});

		expect(result).toBe(false);
		expect(mockDeleteWellbeingUpdate).not.toHaveBeenCalled();
		expect(mockDeleteWellbeingCirclePost).not.toHaveBeenCalled();
	});

	it("deletes and returns true when owned by this org, with no Circle cleanup when circlePostId is null", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({
			id: "w-1",
			organizationId: "org-1",
			circlePostId: null,
		});

		const result = await deleteWellbeingUpdateById({
			organizationId: "org-1",
			updateId: "w-1",
		});

		expect(mockDeleteWellbeingUpdate).toHaveBeenCalledWith("w-1");
		expect(mockDeleteWellbeingCirclePost).not.toHaveBeenCalled();
		expect(result).toBe(true);
	});

	it("best-effort deletes the cross-posted Circle post when circlePostId is set (S8-01 A1)", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({
			id: "w-1",
			organizationId: "org-1",
			circlePostId: "post-1",
		});

		const result = await deleteWellbeingUpdateById({
			organizationId: "org-1",
			updateId: "w-1",
		});

		expect(mockDeleteWellbeingUpdate).toHaveBeenCalledWith("w-1");
		expect(mockDeleteWellbeingCirclePost).toHaveBeenCalledWith({
			organizationId: "org-1",
			circlePostId: "post-1",
		});
		expect(result).toBe(true);
	});
});
