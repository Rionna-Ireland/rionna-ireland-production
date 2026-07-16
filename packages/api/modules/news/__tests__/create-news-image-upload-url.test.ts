/**
 * createNewsImageUploadUrl hardening (S5-09 Task 3.3, audit F3) — the presigned
 * PUT must reject unsafe filenames (bucket-key traversal) and client-declared
 * sizes above the 10 MB image cap.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetSignedUploadUrl, mockGetPublicUrl } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetSignedUploadUrl: vi.fn(),
	mockGetPublicUrl: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/storage", () => ({
	getSignedUploadUrl: mockGetSignedUploadUrl,
	getPublicUrl: mockGetPublicUrl,
}));

import { createNewsImageUploadUrl } from "../procedures/create-news-image-upload-url";

const ADMIN = { id: "admin", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const okInput = { organizationId: "org1", filename: "hero.png", fileSize: 1024 };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetSignedUploadUrl.mockResolvedValue("https://signed.example/upload");
	mockGetPublicUrl.mockReturnValue("https://public.example/hero.png");
});

describe("createNewsImageUploadUrl — upload hardening (S5-09 / F3)", () => {
	it("rejects a path-traversal filename", async () => {
		await expect(
			call(createNewsImageUploadUrl, { ...okInput, filename: "../../evil.png" }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("rejects a fileSize above the 10 MB image cap", async () => {
		await expect(
			call(createNewsImageUploadUrl, { ...okInput, fileSize: 10 * 1024 * 1024 + 1 }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("returns the signed URL for a safe filename within the cap", async () => {
		const result = await call(createNewsImageUploadUrl, okInput, ctx);

		expect(mockGetSignedUploadUrl).toHaveBeenCalledWith("org1/news/hero.png", {
			bucket: "mediaPublic",
		});
		expect(result).toMatchObject({ path: "org1/news/hero.png" });
	});
});
