/**
 * createPhotoUploadUrl hardening (S5-09 Task 3.3, audit F3) — the presigned PUT
 * must reject unsafe filenames (bucket-key traversal) and client-declared sizes
 * above the 10 MB image cap.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetHorseById, mockGetSignedUploadUrl, mockGetPublicUrl } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockGetHorseById: vi.fn(),
		mockGetSignedUploadUrl: vi.fn(),
		mockGetPublicUrl: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	getHorseById: mockGetHorseById,
}));

vi.mock("@repo/storage", () => ({
	getSignedUploadUrl: mockGetSignedUploadUrl,
	getPublicUrl: mockGetPublicUrl,
}));

import { createPhotoUploadUrl } from "./create-photo-upload-url";

const ADMIN = { id: "admin", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const okInput = { horseId: "h1", filename: "gallop.jpg", fileSize: 1024 };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetHorseById.mockResolvedValue({ id: "h1", organizationId: "org1" });
	mockGetSignedUploadUrl.mockResolvedValue("https://signed.example/upload");
	mockGetPublicUrl.mockReturnValue("https://public.example/gallop.jpg");
});

describe("createPhotoUploadUrl — upload hardening (S5-09 / F3)", () => {
	it("rejects a path-traversal filename", async () => {
		await expect(
			call(createPhotoUploadUrl, { ...okInput, filename: "../../evil.jpg" }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("rejects a fileSize above the 10 MB image cap", async () => {
		await expect(
			call(createPhotoUploadUrl, { ...okInput, fileSize: 10 * 1024 * 1024 + 1 }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("returns the signed URL for a safe filename within the cap", async () => {
		const result = await call(createPhotoUploadUrl, okInput, ctx);

		expect(mockGetSignedUploadUrl).toHaveBeenCalledWith("org1/horses/h1/gallop.jpg", {
			bucket: "mediaPublic",
		});
		expect(result).toMatchObject({ path: "org1/horses/h1/gallop.jpg" });
	});
});
