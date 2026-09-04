import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockMemberFindFirst,
	mockGetSignedUploadUrl,
	mockRandomUUID,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockGetSignedUploadUrl: vi.fn(),
	mockRandomUUID: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
	},
	parseOrgMetadata: (raw: string | null) => (raw ? JSON.parse(raw) : {}),
}));
vi.mock("@repo/storage", () => ({
	getSignedUploadUrl: mockGetSignedUploadUrl,
}));
vi.mock("node:crypto", () => ({
	randomUUID: mockRandomUUID,
}));

import { createPostImageUploadUrl } from "../procedures/create-post-image-upload-url";

const USER = { id: "u1", role: "user", name: "Jane" };
const ctx = { context: { headers: new Headers() } };

const okInput = {
	organizationId: "org1",
	filename: "photo.png",
	fileSize: 1024,
	contentType: "image/png" as const,
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: USER });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "org-slug", metadata: null });
	mockMemberFindFirst.mockResolvedValue({ id: "m1" });
	mockGetSignedUploadUrl.mockResolvedValue("https://signed.example/upload");
	mockRandomUUID.mockReturnValue("uuid-1");
});

describe("community.createPostImageUploadUrl", () => {
	it("returns a signed upload URL scoped to the member", async () => {
		const result = await call(createPostImageUploadUrl, okInput, ctx);
		expect(mockGetSignedUploadUrl).toHaveBeenCalledWith("community/org1/m1/uuid-1-photo.png", {
			bucket: "media",
		});
		expect(result).toEqual({
			signedUploadUrl: "https://signed.example/upload",
			path: "community/org1/m1/uuid-1-photo.png",
		});
	});

	it("rejects with FORBIDDEN when communityPosting is killed for the org", async () => {
		mockOrgFindUnique.mockResolvedValue({
			id: "org1",
			slug: "org-slug",
			metadata: JSON.stringify({ features: { communityPosting: false } }),
		});
		await expect(call(createPostImageUploadUrl, okInput, ctx)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("rejects a non-member with FORBIDDEN", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		await expect(call(createPostImageUploadUrl, okInput, ctx)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("rejects a path-traversal filename", async () => {
		await expect(
			call(createPostImageUploadUrl, { ...okInput, filename: "../../evil.png" }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockGetSignedUploadUrl).not.toHaveBeenCalled();
	});

	it("rejects a fileSize above the 10 MB image cap", async () => {
		await expect(
			call(createPostImageUploadUrl, { ...okInput, fileSize: 10 * 1024 * 1024 + 1 }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("rejects an unsupported content type", async () => {
		await expect(
			call(createPostImageUploadUrl, { ...okInput, contentType: "image/gif" } as never, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
