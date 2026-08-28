/**
 * createEventCoverUpload procedure tests (S11-02)
 *
 * Registers an event-cover image blob with Circle and hands back the
 * presigned S3 URL so the browser can PUT the bytes directly (clone of
 * createCircleVideoUpload, image-only, 10MB ceiling).
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

import { createEventCoverUpload } from "../procedures/create-event-cover-upload";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const INPUT = {
	organizationId: "org1",
	filename: "cover.jpg",
	contentType: "image/jpeg",
	byteSize: 1024,
	checksum: "abc==",
};

describe("createEventCoverUpload (S11-02)", () => {
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
				uploadHeaders: { "Content-Type": "image/jpeg", "Content-MD5": "abc==" },
				cdnUrl: "https://assets-v2.circle.so/abc",
			},
		});
	});

	it("registers the blob via the org's Circle service and returns presigned + cdn url", async () => {
		const result = await call(createEventCoverUpload, INPUT, ctx);

		expect(mockCreateCircleService).toHaveBeenCalledWith("rionna");
		expect(mockCreateDirectUpload).toHaveBeenCalledWith({
			filename: "cover.jpg",
			contentType: "image/jpeg",
			byteSize: 1024,
			checksum: "abc==",
		});
		expect(result).toEqual({
			uploadUrl: "https://s3.amazonaws.com/put",
			uploadHeaders: { "Content-Type": "image/jpeg", "Content-MD5": "abc==" },
			cdnUrl: "https://assets-v2.circle.so/abc",
			signedId: "signed-1",
		});
	});

	it("rejects a non-image content type (never touches Circle)", async () => {
		await expect(
			call(createEventCoverUpload, { ...INPUT, contentType: "video/mp4" }, ctx),
		).rejects.toThrow();
		expect(mockCreateDirectUpload).not.toHaveBeenCalled();
	});

	it("rejects a file over 10MB", async () => {
		await expect(
			call(createEventCoverUpload, { ...INPUT, byteSize: 10 * 1024 * 1024 + 1 }, ctx),
		).rejects.toThrow();
		expect(mockCreateDirectUpload).not.toHaveBeenCalled();
	});

	it("accepts a file at exactly the 10MB ceiling", async () => {
		await call(createEventCoverUpload, { ...INPUT, byteSize: 10 * 1024 * 1024 }, ctx);
		expect(mockCreateDirectUpload).toHaveBeenCalled();
	});

	it("throws when the organization is not found", async () => {
		mockOrgFindUnique.mockResolvedValue(null);
		await expect(call(createEventCoverUpload, INPUT, ctx)).rejects.toThrow();
		expect(mockCreateDirectUpload).not.toHaveBeenCalled();
	});

	it("throws when Circle blob registration fails", async () => {
		mockCreateDirectUpload.mockResolvedValue({
			ok: false,
			reason: "server_error",
			retriable: true,
		});
		await expect(call(createEventCoverUpload, INPUT, ctx)).rejects.toThrow();
	});
});
