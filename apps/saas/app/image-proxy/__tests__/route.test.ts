/**
 * Image proxy auth gate (FABLE_AUDIT F1)
 *
 * The proxy re-signs private-bucket reads on every request. Keys are
 * guessable (`{userId}.png` avatars; `{orgId}/member-posts/{file}` media),
 * so without a session check anyone with a key can read club-private
 * media forever. Every consumer of the proxy lives inside the
 * authenticated app (avatars, org logo, admin forms, member-post images);
 * genuinely public assets use the `media-public` bucket's direct URLs and
 * never touch the proxy — so the whole route requires a session.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetSignedUrl, mockMemberFindFirst, bucketNames } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetSignedUrl: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	bucketNames: { avatars: "Avatars_Bucket", media: "Media_Bucket" },
}));

vi.mock("@repo/database", () => ({ db: { member: { findFirst: mockMemberFindFirst } } }));

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@repo/storage", () => ({
	getSignedUrl: mockGetSignedUrl,
}));

vi.mock("@repo/storage/config", () => ({
	config: { bucketNames },
}));

import { GET } from "../[...path]/route";

function makeReq() {
	return new Request("https://app.test/image-proxy/media/org1/member-posts/x.png");
}

function params(path: string[]) {
	return { params: Promise.resolve({ path }) };
}

beforeEach(() => {
	vi.clearAllMocks();
	Object.assign(bucketNames, { avatars: "Avatars_Bucket", media: "Media_Bucket" });
	mockGetSession.mockResolvedValue({ user: { id: "u1" }, session: { id: "s1" } });
	mockGetSignedUrl.mockResolvedValue("https://signed.test/x.png");
	mockMemberFindFirst.mockResolvedValue({ id: "m1" });
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			body: "stream" as unknown as ReadableStream,
			headers: new Headers({ "content-type": "image/png" }),
		}),
	);
});

describe("image proxy GET", () => {
	it("returns 401 without a session and never signs or fetches", async () => {
		mockGetSession.mockResolvedValue(null);

		const res = await GET(makeReq(), params(["media", "org1", "member-posts", "x.png"]));

		expect(res.status).toBe(401);
		expect(mockGetSignedUrl).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("streams the object for an authenticated member", async () => {
		const res = await GET(makeReq(), params(["media", "org1", "member-posts", "x.png"]));

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/png");
		expect(res.headers.get("Cache-Control")).toContain("private");
		expect(mockGetSignedUrl).toHaveBeenCalledWith("org1/member-posts/x.png", {
			bucket: "media",
			expiresIn: 3600,
		});
	});

	it("returns 403 on the media bucket for a cancelled or free user (W-04)", async () => {
		mockMemberFindFirst.mockResolvedValue(null);

		const res = await GET(makeReq(), params(["media", "org1", "member-posts", "x.png"]));

		expect(res.status).toBe(403);
		expect(mockMemberFindFirst.mock.calls[0][0].where).toMatchObject({ userId: "u1" });
		expect(mockGetSignedUrl).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("lets club admins read media without a Purchase", async () => {
		mockGetSession.mockResolvedValue({
			user: { id: "a1", role: "admin" },
			session: { id: "s1" },
		});
		mockMemberFindFirst.mockResolvedValue(null);

		const res = await GET(makeReq(), params(["media", "org1", "member-posts", "x.png"]));

		expect(res.status).toBe(200);
	});

	it("keeps avatars session-only, with no membership check", async () => {
		mockMemberFindFirst.mockResolvedValue(null);

		const res = await GET(makeReq(), params(["avatars", "u2.png"]));

		expect(res.status).toBe(200);
		expect(mockMemberFindFirst).not.toHaveBeenCalled();
	});

	it("also gates the avatars bucket", async () => {
		mockGetSession.mockResolvedValue(null);

		const res = await GET(makeReq(), params(["avatars", "u1.png"]));

		expect(res.status).toBe(401);
	});

	describe("when avatars and media share one physical bucket (staging, prod)", () => {
		beforeEach(() => {
			Object.assign(bucketNames, { avatars: "Shared_Bucket", media: "Shared_Bucket" });
			mockMemberFindFirst.mockResolvedValue(null);
		});

		it.each([
			[["avatars", "org1", "member-posts", "x.png"]],
			[["Shared_Bucket", "org1", "member-posts", "x.png"]],
		])("returns 403 for club media requested as %j", async (path) => {
			const res = await GET(makeReq(), params(path));

			expect(res.status).toBe(403);
			expect(mockGetSignedUrl).not.toHaveBeenCalled();
		});

		it("still serves root-level avatars and logos to non-members", async () => {
			const res = await GET(makeReq(), params(["Shared_Bucket", "u2.png"]));

			expect(res.status).toBe(200);
			expect(mockMemberFindFirst).not.toHaveBeenCalled();
		});
	});

	it("keeps rejecting unknown buckets", async () => {
		const res = await GET(makeReq(), params(["secrets", "x.png"]));

		expect(res.status).toBe(404);
		expect(mockGetSignedUrl).not.toHaveBeenCalled();
	});

	it("keeps rejecting invalid paths", async () => {
		const res = await GET(makeReq(), params(["media"]));

		expect(res.status).toBe(400);
	});
});
