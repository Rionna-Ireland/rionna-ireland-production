import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockGetHorseById,
	mockListWellbeingTimeline,
	mockCreateWellbeingUpdate,
	mockUpdateWellbeingUpdateFields,
	mockDeleteWellbeingUpdateById,
	mockPublishWellbeingUpdate,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetHorseById: vi.fn(),
	mockListWellbeingTimeline: vi.fn(),
	mockCreateWellbeingUpdate: vi.fn(),
	mockUpdateWellbeingUpdateFields: vi.fn(),
	mockDeleteWellbeingUpdateById: vi.fn(),
	mockPublishWellbeingUpdate: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	getHorseById: mockGetHorseById,
}));

vi.mock("../../lib/wellbeing-updates", () => ({
	listWellbeingTimeline: mockListWellbeingTimeline,
	createWellbeingUpdate: mockCreateWellbeingUpdate,
	updateWellbeingUpdateFields: mockUpdateWellbeingUpdateFields,
	deleteWellbeingUpdateById: mockDeleteWellbeingUpdateById,
	publishWellbeingUpdate: mockPublishWellbeingUpdate,
}));

import {
	createWellbeingUpdateProcedure,
	deleteWellbeingUpdateProcedure,
	listWellbeingUpdatesProcedure,
	publishWellbeingUpdateProcedure,
	updateWellbeingUpdateProcedure,
} from "../wellbeing-updates-admin";

const ADMIN = { id: "admin-1", role: "admin" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetHorseById.mockResolvedValue({ id: "h-1", organizationId: "org-1" });
});

describe("listWellbeingUpdatesProcedure", () => {
	it("delegates to listWellbeingTimeline with the active org and horseId", async () => {
		mockListWellbeingTimeline.mockResolvedValue([{ id: "w-1" }]);

		const res = await call(listWellbeingUpdatesProcedure, { horseId: "h-1" }, ctx);

		expect(mockListWellbeingTimeline).toHaveBeenCalledWith({
			organizationId: "org-1",
			horseId: "h-1",
		});
		expect(res).toEqual([{ id: "w-1" }]);
	});
});

describe("createWellbeingUpdateProcedure", () => {
	it("passes publish and notifyMembers through to the service", async () => {
		mockCreateWellbeingUpdate.mockResolvedValue({ id: "w-1" });

		await call(
			createWellbeingUpdateProcedure,
			{
				horseId: "h-1",
				type: "VET",
				body: "Routine checkup.",
				publish: true,
				notifyMembers: true,
			},
			ctx,
		);

		expect(mockCreateWellbeingUpdate).toHaveBeenCalledWith({
			organizationId: "org-1",
			horseId: "h-1",
			type: "VET",
			body: "Routine checkup.",
			publish: true,
			notifyMembers: true,
		});
	});

	it("throws NOT_FOUND when the horse doesn't exist", async () => {
		mockGetHorseById.mockResolvedValue(null);

		await expect(
			call(
				createWellbeingUpdateProcedure,
				{ horseId: "h-1", type: "VET", body: "Routine checkup." },
				ctx,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mockCreateWellbeingUpdate).not.toHaveBeenCalled();
	});

	it("throws NOT_FOUND when the horse belongs to a different organization", async () => {
		mockGetHorseById.mockResolvedValue({ id: "h-1", organizationId: "org-other" });

		await expect(
			call(
				createWellbeingUpdateProcedure,
				{ horseId: "h-1", type: "VET", body: "Routine checkup." },
				ctx,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mockCreateWellbeingUpdate).not.toHaveBeenCalled();
	});
});

describe("updateWellbeingUpdateProcedure", () => {
	it("returns the updated row when found", async () => {
		mockUpdateWellbeingUpdateFields.mockResolvedValue({ id: "w-1", body: "edited" });

		const res = await call(
			updateWellbeingUpdateProcedure,
			{ updateId: "w-1", body: "edited" },
			ctx,
		);

		expect(res).toEqual({ id: "w-1", body: "edited" });
	});

	it("throws NOT_FOUND when the service returns null", async () => {
		mockUpdateWellbeingUpdateFields.mockResolvedValue(null);

		await expect(
			call(updateWellbeingUpdateProcedure, { updateId: "w-1", body: "edited" }, ctx),
		).rejects.toThrow();
	});
});

describe("deleteWellbeingUpdateProcedure", () => {
	it("returns ok when deleted", async () => {
		mockDeleteWellbeingUpdateById.mockResolvedValue(true);

		const res = await call(deleteWellbeingUpdateProcedure, { updateId: "w-1" }, ctx);

		expect(res).toEqual({ ok: true });
	});

	it("throws NOT_FOUND when not found/owned", async () => {
		mockDeleteWellbeingUpdateById.mockResolvedValue(false);

		await expect(
			call(deleteWellbeingUpdateProcedure, { updateId: "w-1" }, ctx),
		).rejects.toThrow();
	});
});

describe("publishWellbeingUpdateProcedure", () => {
	it("delegates notifyMembers through to the service", async () => {
		mockPublishWellbeingUpdate.mockResolvedValue({ id: "w-1", publishedAt: new Date() });

		await call(publishWellbeingUpdateProcedure, { updateId: "w-1", notifyMembers: true }, ctx);

		expect(mockPublishWellbeingUpdate).toHaveBeenCalledWith({
			organizationId: "org-1",
			updateId: "w-1",
			notifyMembers: true,
		});
	});

	it("throws NOT_FOUND when the service returns null", async () => {
		mockPublishWellbeingUpdate.mockResolvedValue(null);

		await expect(
			call(publishWellbeingUpdateProcedure, { updateId: "w-1", notifyMembers: false }, ctx),
		).rejects.toThrow();
	});
});
