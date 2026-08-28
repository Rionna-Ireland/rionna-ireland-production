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
				// S7-03/S7-04 QA: Admin-API posts default likes AND comments OFF —
				// member writes 401 "You cannot perform this action" unless set.
				is_liking_enabled: true,
				is_comments_enabled: true,
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

		it("passes cover_image and location detail through", async () => {
			const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { event: { id: 9 } }));
			vi.stubGlobal("fetch", fetchMock);

			await svc.createEvent({
				spaceId: "42",
				name: "Brunch",
				tiptapBody: DOC,
				startsAt: "2026-09-02T11:00:00Z",
				durationInSeconds: 3600,
				locationType: "in_person",
				inPersonLocation: "Clubhouse",
				coverImageSignedId: "signed-123",
			});

			const [, opts] = fetchMock.mock.calls[0];
			const body = JSON.parse(opts.body);
			expect(body.cover_image).toBe("signed-123");
			// Probed against staging (2026-08-27): a plain string 400s — Circle
			// requires in_person_location as a JSON-encoded string.
			expect(body.event_setting_attributes.in_person_location).toBe(
				JSON.stringify({ address: "Clubhouse" }),
			);
		});
	});

	describe("listEvents", () => {
		it("maps a FLAT record (real Admin v2 shape — probed 2026-08-27, no event_setting_attributes wrapper)", async () => {
			const fetchMock = vi.fn().mockResolvedValue(
				jsonResponse(200, {
					page: 1,
					has_next_page: false,
					records: [
						{
							id: 7,
							name: "Stable visit",
							url: "https://c.example/events/stable-visit",
							cover_image_url: "https://cdn.example/cover.jpg",
							starts_at: "2026-09-01T10:00:00Z",
							ends_at: "2026-09-01T12:00:00Z",
							duration_in_seconds: 7200,
							location_type: "in_person",
							in_person_location: JSON.stringify({ address: "The Yard, Kildare" }),
							virtual_location_url: null,
							rsvp_disabled: false,
							hide_location_from_non_attendees: false,
						},
					],
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			const outcome = await svc.listEvents({ spaceId: "42" });

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data.events[0]).toEqual({
				circleEventId: "7",
				name: "Stable visit",
				startsAt: "2026-09-01T10:00:00Z",
				endsAt: "2026-09-01T12:00:00Z",
				locationType: "in_person",
				inPersonLocation: "The Yard, Kildare",
				virtualLocationUrl: null,
				// Baseline — real records never carry rsvp_count; overlaid
				// separately by includeRsvpCounts (see below).
				rsvpCount: 0,
				// Never exposed by the Admin API.
				rsvpLimit: null,
				coverImageUrl: "https://cdn.example/cover.jpg",
				url: "https://c.example/events/stable-visit",
			});
			expect(outcome.data.hasNextPage).toBe(false);

			const [url] = fetchMock.mock.calls[0];
			expect(String(url)).toContain("space_id=42");
		});

		it("still maps a NESTED record (event_setting_attributes wrapper — the circle-mock server's shape) as a fallback", async () => {
			const fetchMock = vi.fn().mockResolvedValue(
				jsonResponse(200, {
					page: 1,
					has_next_page: false,
					records: [
						{
							id: 7,
							name: "Stable visit",
							url: "https://c.example/events/stable-visit",
							cover_image_url: "https://cdn.example/cover.jpg",
							event_setting_attributes: {
								starts_at: "2026-09-01T10:00:00Z",
								ends_at: "2026-09-01T12:00:00Z",
								location_type: "in_person",
								in_person_location: JSON.stringify({
									address: "The Yard, Kildare",
								}),
							},
						},
					],
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			const outcome = await svc.listEvents({ spaceId: "42" });

			if (!outcome.ok) throw new Error("expected ok");
			expect(outcome.data.events[0]).toMatchObject({
				circleEventId: "7",
				name: "Stable visit",
				startsAt: "2026-09-01T10:00:00Z",
				endsAt: "2026-09-01T12:00:00Z",
				locationType: "in_person",
				inPersonLocation: "The Yard, Kildare",
				rsvpCount: 0,
				rsvpLimit: null,
			});
			expect(outcome.data.hasNextPage).toBe(false);
		});

		it("fails closed on non-2xx", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
			const outcome = await svc.listEvents({ spaceId: "42" });
			expect(outcome.ok).toBe(false);
		});

		describe("includeRsvpCounts", () => {
			function listEventsResponse() {
				return jsonResponse(200, {
					page: 1,
					has_next_page: false,
					records: [
						{ id: 7, name: "Stable visit" },
						{ id: 8, name: "Brunch" },
					],
				});
			}

			it("issues one event_attendees call per event, per_page=1, and maps the envelope's count", async () => {
				const fetchMock = vi
					.fn()
					.mockResolvedValueOnce(listEventsResponse())
					.mockResolvedValueOnce(jsonResponse(200, { count: 5 }))
					.mockResolvedValueOnce(jsonResponse(200, { count: 0 }));
				vi.stubGlobal("fetch", fetchMock);

				const outcome = await svc.listEvents({ spaceId: "42", includeRsvpCounts: true });

				if (!outcome.ok) throw new Error("expected ok");
				expect(outcome.data.events).toHaveLength(2);
				const byId = new Map(outcome.data.events.map((e) => [e.circleEventId, e]));
				expect(byId.get("7")?.rsvpCount).toBe(5);
				expect(byId.get("8")?.rsvpCount).toBe(0);

				expect(fetchMock).toHaveBeenCalledTimes(3);
				const attendeeUrls = fetchMock.mock.calls.slice(1).map(([url]) => String(url));
				expect(attendeeUrls).toContain(
					`${ADMIN_BASE}/event_attendees?event_id=7&per_page=1`,
				);
				expect(attendeeUrls).toContain(
					`${ADMIN_BASE}/event_attendees?event_id=8&per_page=1`,
				);
			});

			it("does not call event_attendees when the flag is omitted", async () => {
				const fetchMock = vi.fn().mockResolvedValueOnce(listEventsResponse());
				vi.stubGlobal("fetch", fetchMock);

				const outcome = await svc.listEvents({ spaceId: "42" });

				if (!outcome.ok) throw new Error("expected ok");
				expect(outcome.data.events.every((e) => e.rsvpCount === 0)).toBe(true);
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});

			it("keeps rsvpCount at 0 and warns, without failing the list, when a per-event fetch fails", async () => {
				const fetchMock = vi
					.fn()
					.mockResolvedValueOnce(listEventsResponse())
					.mockResolvedValueOnce(jsonResponse(500, {}))
					.mockResolvedValueOnce(jsonResponse(200, { count: 2 }));
				vi.stubGlobal("fetch", fetchMock);

				const outcome = await svc.listEvents({ spaceId: "42", includeRsvpCounts: true });

				if (!outcome.ok) throw new Error("expected ok");
				const byId = new Map(outcome.data.events.map((e) => [e.circleEventId, e]));
				expect(byId.get("7")?.rsvpCount).toBe(0);
				expect(byId.get("8")?.rsvpCount).toBe(2);
				expect(mockLogger.warn).toHaveBeenCalledWith(
					expect.stringContaining("event_attendees"),
					expect.objectContaining({ circleEventId: "7" }),
				);
			});

			it("keeps rsvpCount at 0 and warns on a network failure, without failing the list", async () => {
				const fetchMock = vi
					.fn()
					.mockResolvedValueOnce(listEventsResponse())
					.mockRejectedValueOnce(new Error("boom"))
					.mockResolvedValueOnce(jsonResponse(200, { count: 1 }));
				vi.stubGlobal("fetch", fetchMock);

				const outcome = await svc.listEvents({ spaceId: "42", includeRsvpCounts: true });

				if (!outcome.ok) throw new Error("expected ok");
				const byId = new Map(outcome.data.events.map((e) => [e.circleEventId, e]));
				expect(byId.get("7")?.rsvpCount).toBe(0);
				expect(byId.get("8")?.rsvpCount).toBe(1);
				expect(mockLogger.warn).toHaveBeenCalled();
			});
		});

		it("sends filter_date[start_date] when startDateFrom is given (S11-02 fix — page 1 truncation)", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValue(
					jsonResponse(200, { page: 1, has_next_page: false, records: [] }),
				);
			vi.stubGlobal("fetch", fetchMock);

			await svc.listEvents({ spaceId: "42", startDateFrom: "2026-08-28" });

			const [url] = fetchMock.mock.calls[0];
			expect(String(url)).toContain(
				`filter_date%5Bstart_date%5D=${encodeURIComponent("2026-08-28")}`,
			);
		});

		it("omits filter_date[start_date] when startDateFrom is not given", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValue(
					jsonResponse(200, { page: 1, has_next_page: false, records: [] }),
				);
			vi.stubGlobal("fetch", fetchMock);

			await svc.listEvents({ spaceId: "42" });

			const [url] = fetchMock.mock.calls[0];
			expect(String(url)).not.toContain("filter_date");
		});
	});

	describe("updateEvent", () => {
		it("always sends space_id (Circle 404s the PUT without it) plus only the provided fields", async () => {
			const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 7 }));
			vi.stubGlobal("fetch", fetchMock);

			const outcome = await svc.updateEvent({
				eventId: "7",
				spaceId: "42",
				name: "New name",
			});

			expect(outcome.ok).toBe(true);
			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ADMIN_BASE}/events/7`);
			expect(opts.method).toBe("PUT");
			expect(JSON.parse(opts.body)).toEqual({ space_id: 42, name: "New name" });
		});

		it("encodes in_person_location as a JSON string", async () => {
			const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 7 }));
			vi.stubGlobal("fetch", fetchMock);

			await svc.updateEvent({
				eventId: "7",
				spaceId: "42",
				inPersonLocation: "Naas Racecourse",
			});

			const [, opts] = fetchMock.mock.calls[0];
			const body = JSON.parse(opts.body);
			expect(body.event_setting_attributes.in_person_location).toBe(
				JSON.stringify({ address: "Naas Racecourse" }),
			);
		});
	});

	describe("deleteEvent", () => {
		it("succeeds on 2xx and sends space_id as a query param (Circle 404s the DELETE without it)", async () => {
			const fetchMock = vi.fn().mockResolvedValue(jsonResponse(204, undefined));
			vi.stubGlobal("fetch", fetchMock);

			const outcome = await svc.deleteEvent({ eventId: "7", spaceId: "42" });

			expect(outcome.ok).toBe(true);
			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("?space_id=42");
		});

		it("fails closed on non-2xx", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
			const outcome = await svc.deleteEvent({ eventId: "7", spaceId: "42" });
			expect(outcome.ok).toBe(false);
		});
	});
});
