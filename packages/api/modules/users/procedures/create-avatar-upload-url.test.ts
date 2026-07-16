/**
 * createAvatarUploadUrl hardening (S5-09 Task 3.3, audit F3) — the presigned PUT
 * must reject client-declared sizes above the 10 MB image cap. The storage key is
 * fixed (`{userId}.png`), so no filename validation applies here.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetSignedUploadUrl } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetSignedUploadUrl: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/storage", () => ({
	getSignedUploadUrl: mockGetSignedUploadUrl,
}));

import { createAvatarUploadUrl } from "./create-avatar-upload-url";

const USER = { id: "u1", role: "member", name: "Alice" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockGetSignedUploadUrl.mockResolvedValue("https://signed.example/upload");
});

describe("createAvatarUploadUrl — upload hardening (S5-09 / F3)", () => {
	it("rejects a fileSize above the 10 MB image cap", async () => {
		await expect(
			call(createAvatarUploadUrl, { fileSize: 10 * 1024 * 1024 + 1 }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("returns the signed URL for a size within the cap", async () => {
		const result = await call(createAvatarUploadUrl, { fileSize: 1024 }, ctx);

		expect(mockGetSignedUploadUrl).toHaveBeenCalledWith("u1.png", {
			bucket: "avatars",
		});
		expect(result).toMatchObject({ path: "u1.png" });
	});
});
