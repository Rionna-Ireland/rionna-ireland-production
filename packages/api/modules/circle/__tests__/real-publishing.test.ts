/**
 * RealCircleService publishing tests (S2-09 slice 1)
 *
 * Pins the EXACT Circle Admin API v2 request shapes proven by the live spike
 * (tooling/scripts/CIRCLE-SPIKE-NOTES.md). These tests are the canary: if a
 * Circle schema change or a careless edit drifts the wire shape, they fail
 * before a member-facing post does. Covers createPost / uploadImage /
 * createEmbed / createSpace / createEvent plus failure→outcome mapping.
 */

import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
	mockLogger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		log: vi.fn(),
	},
}));

vi.mock("@repo/logs", () => ({ logger: mockLogger }));

// The constructor instantiates the Headless SDK; stub it so `new` is cheap.
vi.mock("@circleco/headless-server-sdk", () => ({
	createClient: vi.fn(() => ({
		getMemberAPITokenFromCommunityMemberId: vi.fn(),
	})),
}));

import { RealCircleService } from "@repo/payments/lib/circle";

const ADMIN_BASE = "https://app.circle.so/api/admin/v2";

const DOC = {
	body: {
		type: "doc" as const,
		content: [
			{
				type: "paragraph",
				content: [{ type: "text", text: "Pink Diamond Lass worked well." }],
			},
		],
	},
};

function jsonResponse(status: number, body: unknown) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body),
	};
}

describe("RealCircleService — publishing surface (S2-09)", () => {
	let svc: RealCircleService;

	beforeEach(() => {
		svc = new RealCircleService("admin-token", "headless-app-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	describe("createPost", () => {
		it("POSTs to /posts with the tiptap body and returns the post id + status", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValue(jsonResponse(200, { post: { id: 5001, status: "published" } }));
			vi.stubGlobal("fetch", fetchMock);

			const outcome = await svc.createPost({
				spaceId: "2681063",
				name: "Trainer update",
				tiptapBody: DOC,
			});

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data).toEqual({ circlePostId: "5001", status: "published" });

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ADMIN_BASE}/posts`);
			expect(opts.method).toBe("POST");
			expect(opts.headers.Authorization).toBe("Bearer admin-token");
			expect(JSON.parse(opts.body)).toEqual({
				space_id: 2681063,
				name: "Trainer update",
				tiptap_body: DOC,
				// S7-03 QA: Admin-API posts default likes OFF — members' like taps
				// 401 with "You cannot perform this action" unless this is set.
				is_liking_enabled: true,
			});
		});

		it("includes attachments only when provided", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValue(jsonResponse(200, { post: { id: 1, status: "published" } }));
			vi.stubGlobal("fetch", fetchMock);

			await svc.createPost({
				spaceId: "1",
				name: "x",
				tiptapBody: DOC,
				attachments: ["signed-1", "signed-2"],
			});

			expect(JSON.parse(fetchMock.mock.calls[0][1].body).attachments).toEqual([
				"signed-1",
				"signed-2",
			]);
		});

		it("maps a 422 to invalid_input (terminal)", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, { error: "bad" })));
			const outcome = await svc.createPost({ spaceId: "1", name: "x", tiptapBody: DOC });
			expect(outcome).toMatchObject({ ok: false, reason: "invalid_input", retriable: false });
		});

		it("maps a network throw to network (retriable)", async () => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
			const outcome = await svc.createPost({ spaceId: "1", name: "x", tiptapBody: DOC });
			expect(outcome).toMatchObject({ ok: false, reason: "network", retriable: true });
		});
	});

	describe("uploadImage", () => {
		it("registers the blob (param is `blob`, base64-MD5 checksum) then PUTs the bytes", async () => {
			const data = new Uint8Array([1, 2, 3]);
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(
					jsonResponse(200, {
						signed_id: "signed-xyz",
						attachable_sgid: "sgid-xyz",
						direct_upload: {
							url: "https://s3.example/put",
							headers: { "Content-MD5": "abc", "Content-Type": "image/jpeg" },
						},
					}),
				)
				.mockResolvedValueOnce(jsonResponse(200, {}));
			vi.stubGlobal("fetch", fetchMock);

			const outcome = await svc.uploadImage({
				filename: "lass.jpg",
				contentType: "image/jpeg",
				data,
			});

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data).toEqual({ signedId: "signed-xyz", attachableSgid: "sgid-xyz" });

			const [regUrl, regOpts] = fetchMock.mock.calls[0];
			expect(regUrl).toBe(`${ADMIN_BASE}/direct_uploads`);
			const expectedChecksum = createHash("md5")
				.update(Buffer.from([1, 2, 3]))
				.digest("base64");
			expect(JSON.parse(regOpts.body)).toEqual({
				blob: {
					filename: "lass.jpg",
					byte_size: 3,
					checksum: expectedChecksum,
					content_type: "image/jpeg",
				},
			});

			const [putUrl, putOpts] = fetchMock.mock.calls[1];
			expect(putUrl).toBe("https://s3.example/put");
			expect(putOpts.method).toBe("PUT");
			expect(putOpts.headers).toEqual({ "Content-MD5": "abc", "Content-Type": "image/jpeg" });
			expect(putOpts.body).toBe(data);
		});

		it("does not PUT if the register step fails", async () => {
			const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, { error: "nope" }));
			vi.stubGlobal("fetch", fetchMock);

			const outcome = await svc.uploadImage({
				filename: "a.jpg",
				contentType: "image/jpeg",
				data: new Uint8Array([9]),
			});

			expect(outcome).toMatchObject({ ok: false, reason: "auth" });
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});

	describe("createEmbed", () => {
		it("POSTs the url to /embeds and returns the sgid", async () => {
			const fetchMock = vi.fn().mockResolvedValue(
				jsonResponse(201, {
					sgid: "sgid-123",
					embed_type: "video",
					circle_embed_url: "https://c/e",
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			const outcome = await svc.createEmbed({ url: "https://youtu.be/abc" });

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data).toEqual({ sgid: "sgid-123", embedType: "video" });

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ADMIN_BASE}/embeds`);
			expect(JSON.parse(opts.body)).toEqual({ url: "https://youtu.be/abc" });
		});
	});

	describe("createSpace", () => {
		it("POSTs to /spaces with private basic defaults and returns the space id", async () => {
			const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { space: { id: 99 } }));
			vi.stubGlobal("fetch", fetchMock);

			const outcome = await svc.createSpace({
				name: "Pink Diamond Lass",
				spaceGroupId: "1081220",
			});

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data).toEqual({ circleSpaceId: "99" });

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ADMIN_BASE}/spaces`);
			expect(JSON.parse(opts.body)).toEqual({
				name: "Pink Diamond Lass",
				space_group_id: 1081220,
				space_type: "basic",
				is_private: true,
			});
		});
	});

	describe("createEvent", () => {
		it("POSTs to /events with event_setting_attributes and returns the event id", async () => {
			const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { event: { id: 555 } }));
			vi.stubGlobal("fetch", fetchMock);

			const outcome = await svc.createEvent({
				spaceId: "2682536",
				name: "Yard visit",
				tiptapBody: DOC,
				startsAt: "2026-07-01T10:00:00.000Z",
				durationInSeconds: 3600,
			});

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data).toEqual({ circleEventId: "555" });

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ADMIN_BASE}/events`);
			expect(JSON.parse(opts.body)).toEqual({
				space_id: 2682536,
				name: "Yard visit",
				tiptap_body: DOC,
				event_setting_attributes: {
					starts_at: "2026-07-01T10:00:00.000Z",
					duration_in_seconds: 3600,
					location_type: "tbd",
				},
			});
		});
	});
});
