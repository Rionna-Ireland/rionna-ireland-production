/**
 * createLogoUploadUrl procedure (S5-07 item 4) — the signed WRITE URL to the
 * club logo path must be gated behind adminProcedure, so a regular member
 * cannot obtain a URL to overwrite the org logo.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetOrganizationById, mockGetSignedUploadUrl } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockGetOrganizationById: vi.fn(),
		mockGetSignedUploadUrl: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	getOrganizationById: mockGetOrganizationById,
}));

vi.mock("@repo/storage", () => ({
	getSignedUploadUrl: mockGetSignedUploadUrl,
}));

import { createLogoUploadUrl } from "./create-logo-upload-url";

const ADMIN = { id: "admin", role: "admin", name: "Emma" };
const MEMBER = { id: "member", role: "member", name: "Alice" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const okInput = { organizationId: "org1" };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetOrganizationById.mockResolvedValue({ id: "org1" });
	mockGetSignedUploadUrl.mockResolvedValue("https://signed.example/upload");
});

describe("createLogoUploadUrl procedure (S5-07 item 4)", () => {
	it("forbids a regular member from obtaining a logo upload URL", async () => {
		mockGetSession.mockResolvedValue({ user: MEMBER, session: SESSION });

		await expect(call(createLogoUploadUrl, okInput, ctx)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("returns the signed upload URL and path for an admin", async () => {
		const result = await call(createLogoUploadUrl, okInput, ctx);

		expect(mockGetSignedUploadUrl).toHaveBeenCalledWith("org1.png", {
			bucket: "avatars",
		});
		expect(result).toEqual({
			signedUploadUrl: "https://signed.example/upload",
			path: "org1.png",
		});
	});
});
