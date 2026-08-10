/**
 * createAudioUploadUrl hardening (S8-01 §5/§6) — mirrors createPhotoUploadUrl's
 * upload guardrails, with the larger 25 MB audio cap and a distinct
 * `audio-notes/` storage path so audio never collides with the photo gallery.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetHorseById, mockGetSignedUploadUrl, mockGetPublicUrl } = vi.hoisted(
	() => ({
		mockGetSession: vi.fn(),
		mockGetHorseById: vi.fn(),
		mockGetSignedUploadUrl: vi.fn(),
		mockGetPublicUrl: vi.fn(),
	}),
);

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	getHorseById: mockGetHorseById,
}));

vi.mock("@repo/storage", () => ({
	getSignedUploadUrl: mockGetSignedUploadUrl,
	getPublicUrl: mockGetPublicUrl,
}));

import { createAudioUploadUrl } from "./create-audio-upload-url";

const ADMIN = { id: "admin", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const okInput = { horseId: "h1", filename: "vet-note.m4a", fileSize: 1024 };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetHorseById.mockResolvedValue({ id: "h1", organizationId: "org1" });
	mockGetSignedUploadUrl.mockResolvedValue("https://signed.example/upload");
	mockGetPublicUrl.mockReturnValue("https://public.example/vet-note.m4a");
});

describe("createAudioUploadUrl", () => {
	it("rejects a path-traversal filename", async () => {
		await expect(
			call(createAudioUploadUrl, { ...okInput, filename: "../../evil.m4a" }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("rejects a fileSize above the 25 MB audio cap", async () => {
		await expect(
			call(createAudioUploadUrl, { ...okInput, fileSize: 25 * 1024 * 1024 + 1 }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("returns the signed URL under an audio-notes/ path, distinct from photos", async () => {
		const result = await call(createAudioUploadUrl, okInput, ctx);

		expect(mockGetSignedUploadUrl).toHaveBeenCalledWith(
			"org1/horses/h1/audio-notes/vet-note.m4a",
			{ bucket: "mediaPublic" },
		);
		expect(result).toMatchObject({ path: "org1/horses/h1/audio-notes/vet-note.m4a" });
	});

	it("404s when the horse doesn't exist", async () => {
		mockGetHorseById.mockResolvedValue(null);

		await expect(call(createAudioUploadUrl, okInput, ctx)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});
