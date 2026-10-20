import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockFindUnique, mockGetSignedUploadUrl } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockFindUnique: vi.fn(),
	mockGetSignedUploadUrl: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({ db: { organization: { findUnique: mockFindUnique } } }));
vi.mock("@repo/storage", () => ({
	getSignedUploadUrl: mockGetSignedUploadUrl,
	getPublicUrl: (_b: string, path: string) => `https://cdn/x/${path}`,
}));

import { createWebsiteUploadUrl } from "../procedures/create-website-upload-url";

const ctx = { context: { headers: new Headers() } };
const ok = {
	organizationId: "org1",
	kind: "hero" as const,
	filename: "a.jpg",
	fileSize: 1024,
	contentType: "image/jpeg",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({
		user: { id: "u1", role: "admin", name: "Emma" },
		session: { id: "s1", activeOrganizationId: "org1" },
	});
	mockFindUnique.mockResolvedValue({ id: "org1" });
	mockGetSignedUploadUrl.mockResolvedValue("https://signed.example/u");
});

describe("createWebsiteUploadUrl", () => {
	it("creates a path under org/website/kind with a uuid prefix", async () => {
		const res = await call(createWebsiteUploadUrl, ok, ctx);
		expect(res.path).toMatch(/^org1\/website\/hero\/[0-9a-f-]{36}-a\.jpg$/);
		expect(res.publicUrl).toBe(`https://cdn/x/${res.path}`);
		expect(mockGetSignedUploadUrl).toHaveBeenCalledWith(res.path, { bucket: "mediaPublic" });
	});

	it("accepts hero mp4 up to 25 MB", async () => {
		await call(
			createWebsiteUploadUrl,
			{ ...ok, filename: "a.mp4", contentType: "video/mp4", fileSize: 25 * 1024 * 1024 },
			ctx,
		);
		expect(mockGetSignedUploadUrl).toHaveBeenCalled();
	});

	it("rejects video for founder kind", async () => {
		await expect(
			call(
				createWebsiteUploadUrl,
				{ ...ok, kind: "founder", filename: "a.mp4", contentType: "video/mp4" },
				ctx,
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("rejects video over 25 MB", async () => {
		await expect(
			call(
				createWebsiteUploadUrl,
				{
					...ok,
					filename: "a.mp4",
					contentType: "video/mp4",
					fileSize: 25 * 1024 * 1024 + 1,
				},
				ctx,
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("rejects image/gif", async () => {
		await expect(
			call(
				createWebsiteUploadUrl,
				{ ...ok, filename: "a.gif", contentType: "image/gif" },
				ctx,
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("rejects an image over 10 MB", async () => {
		await expect(
			call(createWebsiteUploadUrl, { ...ok, fileSize: 10 * 1024 * 1024 + 1 }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
