import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockMemberFindFirst, mockCreateDirectUpload, mockCheckRateLimit } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockOrgFindUnique: vi.fn(),
		mockMemberFindFirst: vi.fn(),
		mockCreateDirectUpload: vi.fn(),
		mockCheckRateLimit: vi.fn(),
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
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: () => ({ createDirectUpload: mockCreateDirectUpload }),
}));
vi.mock("@repo/utils/lib/rate-limit", () => ({ checkRateLimit: mockCheckRateLimit }));

import { verifyMediaToken } from "../lib/media-token";
import { createMediaUpload } from "../procedures/create-media-upload";

const ctx = { context: { headers: new Headers() } };
const okInput = {
	organizationId: "org1",
	filename: "photo.jpg",
	contentType: "image/jpeg",
	byteSize: 1024,
	checksum: "abc==",
};

beforeEach(() => {
	process.env.BETTER_AUTH_SECRET = "test-secret";
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: { id: "u1", role: "user" } });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "org-slug", metadata: null });
	mockMemberFindFirst.mockResolvedValue({ id: "m1", circleMemberId: "cm1" });
	mockCheckRateLimit.mockResolvedValue({ ok: true });
	mockCreateDirectUpload.mockResolvedValue({
		ok: true,
		data: {
			signedId: "sid",
			attachableSgid: "sgid",
			uploadUrl: "https://s3/put",
			uploadHeaders: { "Content-MD5": "abc==" },
			cdnUrl: "https://cdn/x",
		},
	});
});

describe("community.createMediaUpload", () => {
	it("returns the upload details and a verifiable token", async () => {
		const result = await call(createMediaUpload, okInput, ctx);
		expect(result).toMatchObject({
			kind: "image",
			uploadUrl: "https://s3/put",
			uploadHeaders: { "Content-MD5": "abc==" },
			signedId: "sid",
			cdnUrl: "https://cdn/x",
		});
		expect(verifyMediaToken(result.mediaToken, { memberId: "m1", orgId: "org1" })).toMatchObject({
			signedId: "sid",
			attachableSgid: "sgid",
			kind: "image",
		});
	});

	it("classifies video/quicktime as video", async () => {
		const result = await call(createMediaUpload, { ...okInput, filename: "a.mov", contentType: "video/quicktime", byteSize: 5_000_000 }, ctx);
		expect(result.kind).toBe("video");
	});

	it("rejects with FORBIDDEN when posting is killed", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "s", metadata: JSON.stringify({ features: { communityPosting: false } }) });
		await expect(call(createMediaUpload, okInput, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockCreateDirectUpload).not.toHaveBeenCalled();
	});

	it("rejects with FORBIDDEN when there is no member or no circleMemberId", async () => {
		for (const m of [null, { id: "m1", circleMemberId: null }]) {
			mockMemberFindFirst.mockResolvedValue(m);
			await expect(call(createMediaUpload, okInput, ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
	});

	it("rejects a bad content type, filename and oversize files", async () => {
		const cases = [
			{ ...okInput, contentType: "application/pdf" },
			{ ...okInput, filename: "../x.jpg" },
			{ ...okInput, byteSize: 10 * 1024 * 1024 + 1 },
			{ ...okInput, filename: "a.mp4", contentType: "video/mp4", byteSize: 200 * 1024 * 1024 + 1 },
		];
		for (const input of cases) {
			await expect(call(createMediaUpload, input, ctx)).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		expect(mockCreateDirectUpload).not.toHaveBeenCalled();
	});

	it("rejects with TOO_MANY_REQUESTS when rate limited", async () => {
		mockCheckRateLimit.mockResolvedValue({ ok: false });
		await expect(call(createMediaUpload, okInput, ctx)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
		expect(mockCreateDirectUpload).not.toHaveBeenCalled();
	});

	it("maps a Circle failure to INTERNAL_SERVER_ERROR", async () => {
		mockCreateDirectUpload.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });
		await expect(call(createMediaUpload, okInput, ctx)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});
