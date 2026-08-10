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
} = vi.hoisted(() => ({
	mockCreateWellbeingUpdate: vi.fn(),
	mockGetWellbeingUpdateById: vi.fn(),
	mockUpdateWellbeingUpdate: vi.fn(),
	mockDeleteWellbeingUpdate: vi.fn(),
	mockListWellbeingUpdatesForAdmin: vi.fn(),
	mockListPublishedWellbeingUpdates: vi.fn(),
	mockGetHorseById: vi.fn(),
	mockSendPush: vi.fn(),
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
});

describe("createWellbeingUpdate", () => {
	it("creates a draft (publishedAt null) and never pushes when publish is omitted", async () => {
		mockCreateWellbeingUpdate.mockResolvedValue({
			id: "w-1",
			horseId: "h-1",
			organizationId: "org-1",
			type: "VET",
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
	});

	it("publishes immediately but does not push when notifyMembers is false", async () => {
		mockCreateWellbeingUpdate.mockResolvedValue({
			id: "w-1",
			horseId: "h-1",
			organizationId: "org-1",
			type: "TRAINING",
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
	});

	it("publish + notifyMembers fires a HORSE_WELLBEING push scoped to the horse's followers", async () => {
		mockCreateWellbeingUpdate.mockResolvedValue({
			id: "w-1",
			horseId: "h-1",
			organizationId: "org-1",
			type: "REHAB",
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
	});

	it("sets publishedAt and fires a push when notifyMembers is true", async () => {
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
	});

	it("deletes and returns true when owned by this org", async () => {
		mockGetWellbeingUpdateById.mockResolvedValue({ id: "w-1", organizationId: "org-1" });

		const result = await deleteWellbeingUpdateById({
			organizationId: "org-1",
			updateId: "w-1",
		});

		expect(mockDeleteWellbeingUpdate).toHaveBeenCalledWith("w-1");
		expect(result).toBe(true);
	});
});
