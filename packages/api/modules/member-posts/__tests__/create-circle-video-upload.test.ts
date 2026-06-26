/**
 * createCircleVideoUpload procedure tests (S2-12 video upload)
 *
 * Registers a video blob with Circle and returns the presigned S3 PUT URL so the
 * browser can upload the bytes directly (verified CORS-open). Circle service +
 * db are mocked — they have their own suites.
 */
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockCreateCircleService, mockCreateDirectUpload } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockOrgFindUnique: vi.fn(),
		mockCreateCircleService: vi.fn(),
		mockCreateDirectUpload: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: { organization: { findUnique: mockOrgFindUnique } },
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock("@repo/payments/lib/circle", () => ({ createCircleService: mockCreateCircleService }));

import { createCircleVideoUpload } from "../procedures/create-circle-video-upload";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const INPUT = {
	organizationId: "org1",
	filename: "clip.mp4",
	contentType: "video/mp4",
	byteSize: 1024,
	checksum: "abc==",
};

describe("createCircleVideoUpload (S2-12)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ slug: "rionna" });
		mockCreateCircleService.mockReturnValue({ createDirectUpload: mockCreateDirectUpload });
		mockCreateDirectUpload.mockResolvedValue({
			ok: true,
			data: {
				signedId: "signed-1",
				attachableSgid: "sgid-1",
				uploadUrl: "https://s3.amazonaws.com/put",
				uploadHeaders: { "Content-Type": "video/mp4", "Content-MD5": "abc==" },
				cdnUrl: "https://assets-v2.circle.so/abc",
			},
		});
	});

	it("registers the blob via the org's Circle service and returns presigned + cdn url", async () => {
		const result = await call(createCircleVideoUpload, INPUT, ctx);

		expect(mockCreateCircleService).toHaveBeenCalledWith("rionna");
		expect(mockCreateDirectUpload).toHaveBeenCalledWith({
			filename: "clip.mp4",
			contentType: "video/mp4",
			byteSize: 1024,
			checksum: "abc==",
		});
		expect(result).toEqual({
			uploadUrl: "https://s3.amazonaws.com/put",
			uploadHeaders: { "Content-Type": "video/mp4", "Content-MD5": "abc==" },
			cdnUrl: "https://assets-v2.circle.so/abc",
			signedId: "signed-1",
		});
	});

	it("rejects a non-video content type (never touches Circle)", async () => {
		await expect(
			call(createCircleVideoUpload, { ...INPUT, contentType: "image/png" }, ctx),
		).rejects.toThrow();
		expect(mockCreateDirectUpload).not.toHaveBeenCalled();
	});

	it("throws when the organization is not found", async () => {
		mockOrgFindUnique.mockResolvedValue(null);
		await expect(call(createCircleVideoUpload, INPUT, ctx)).rejects.toThrow();
		expect(mockCreateDirectUpload).not.toHaveBeenCalled();
	});

	it("throws when Circle blob registration fails", async () => {
		mockCreateDirectUpload.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });
		await expect(call(createCircleVideoUpload, INPUT, ctx)).rejects.toThrow();
	});
});
