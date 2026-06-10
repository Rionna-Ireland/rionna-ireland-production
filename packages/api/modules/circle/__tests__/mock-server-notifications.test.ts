/**
 * MockServerCircleService.getMemberNotifications tests
 *
 * Verifies that the mock-server proxy implementation:
 * - Mints a member token via the circle-mock /api/v1/headless/auth_token endpoint
 * - Calls GET {baseUrl}/api/headless/v1/notifications with after_id / per_page
 * - Normalises circle-mock's wire JSON (mirrors Circle's real shape) into CircleNotification
 * - Returns CircleCallOutcome for all HTTP / network / token failures
 * - Honours the base URL passed into the constructor
 *
 * Part of S6-01 (T5). T6 extends circle-mock to actually serve this endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
	mockLogger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		log: vi.fn(),
	},
}));

vi.mock("@repo/logs", () => ({
	logger: mockLogger,
}));

import { MockServerCircleService } from "@repo/payments/lib/circle";

const BASE_URL = "http://localhost:5100";

function makeService() {
	return new MockServerCircleService({
		baseUrl: BASE_URL,
		adminToken: "admin-token",
		appToken: "app-token",
	});
}

function mockFetchJson(status: number, jsonBody: unknown) {
	const res = {
		ok: status >= 200 && status < 300,
		status,
		json: async () => jsonBody,
		text: async () => JSON.stringify(jsonBody),
	};
	return vi.fn().mockResolvedValue(res);
}

describe("MockServerCircleService.getMemberNotifications", () => {
	let svc: MockServerCircleService;

	beforeEach(() => {
		svc = makeService();
		vi.stubGlobal("fetch", vi.fn());
		mockLogger.info.mockClear();
		mockLogger.warn.mockClear();
		mockLogger.error.mockClear();
		mockLogger.debug.mockClear();
		mockLogger.log.mockClear();
		// Default: token mint succeeds.
		vi.spyOn(svc, "getMemberToken").mockResolvedValue({
			ok: true,
			data: {
				accessToken: "jwt-for-member",
				refreshToken: "refresh",
				expiresAt: "2026-06-10T12:00:00.000Z",
			},
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns normalised page + cursor on 200 with records", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchJson(200, {
				records: [
					{
						id: 1001,
						notification_type: "post_mention",
						created_at: "2026-04-23T10:00:00Z",
						actor: { id: 7, name: "Alice" },
						subject: { type: "post", id: 55, space_id: 12, url: "https://c/p/55" },
						text: "Alice mentioned you",
					},
				],
				has_next_page: false,
			}),
		);

		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: null,
		});

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.data.items).toHaveLength(1);
		expect(outcome.data.items[0]).toMatchObject({
			id: "1001",
			type: "mention",
			createdAt: "2026-04-23T10:00:00Z",
			actor: { id: "7", name: "Alice" },
			subject: {
				kind: "post",
				id: "55",
				spaceId: "12",
				url: "https://c/p/55",
			},
			text: "Alice mentioned you",
		});
		expect(outcome.data.nextCursor).toBe("1001");
	});

	it("normalises the real live Circle action/notifiable payload for mentions", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchJson(200, {
				records: [
					{
						id: 38121863575,
						created_at: "2026-04-23T15:05:09.159Z",
						action: "mention",
						notifiable_id: 101781701,
						space_id: 2598628,
						actor_name: "Tom Power",
						notifiable_title: "TEST",
						notifiable_type: "Comment",
						action_web_url: "https://community.rionna-e53dba.club/c/test-horse/test-4c6646#comment_wrapper_101781701",
						notifiable: {
							id: 101781701,
							post_id: 31956060,
							parent_comment_id: null,
							community_id: 517885,
							space_id: 2598628,
						},
					},
				],
			}),
		);

		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: null,
		});

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.data.items[0]).toMatchObject({
			id: "38121863575",
			type: "mention",
			actor: { id: "Tom Power", name: "Tom Power" },
			subject: {
				kind: "comment",
				id: "101781701",
				spaceId: "2598628",
			},
			text: "TEST",
		});
	});

	it("normalises the real live Circle action/notifiable payload for reactions", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchJson(200, {
				records: [
					{
						id: 38093662859,
						created_at: "2026-04-22T17:37:09.951Z",
						action: "like",
						notifiable_id: 101696496,
						space_id: 2598628,
						actor_name: "Tom Power",
						notifiable_title: "I love the horses",
						notifiable_type: "Comment",
						action_web_url: "https://community.rionna-e53dba.club/c/test-horse/i-love-the-horses#comment_wrapper_101696496",
						notifiable: {
							id: 101696496,
							post_id: 31926598,
							parent_comment_id: null,
							community_id: 517885,
							space_id: 2598628,
						},
					},
				],
			}),
		);

		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: null,
		});

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.data.items[0]).toMatchObject({
			id: "38093662859",
			type: "reaction",
			subject: {
				kind: "comment",
				id: "101696496",
				spaceId: "2598628",
			},
			text: "I love the horses",
		});
	});

	it("normalises the real live Circle action/notifiable payload for new posts", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchJson(200, {
				records: [
					{
						id: 38119497817,
						created_at: "2026-04-23T14:04:44.459Z",
						action: "add",
						notifiable_id: 31953658,
						space_title: "Test Horse",
						display_action: "posted",
						space_id: 2598628,
						actor_name: "Tom Power",
						notifiable_title: "Wow I love horses!",
						notifiable_type: "Post",
						action_web_url: "https://community.rionna-e53dba.club/c/test-horse/wow-i-love-horses",
						notifiable: {
							id: 31953658,
							community_id: 517885,
							space_id: 2598628,
						},
					},
				],
			}),
		);

		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: null,
		});

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.data.items[0]).toMatchObject({
			id: "38119497817",
			type: "post",
			spaceTitle: "Test Horse",
			displayAction: "posted",
			subject: {
				kind: "post",
				id: "31953658",
				spaceId: "2598628",
				title: "Wow I love horses!",
			},
			text: "Wow I love horses!",
		});
	});

	it("normalises comment actions as comment notifications", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchJson(200, {
				records: [
					{
						id: 38122882518,
						created_at: "2026-04-23T15:30:21.004Z",
						action: "comment",
						notifiable_id: 101784330,
						space_title: "Test Horse",
						display_action: "commented on your post:",
						space_id: 2598628,
						actor_name: "Tom Power",
						notifiable_title: "Lol",
						notifiable_type: "Comment",
						action_web_url: "https://community.rionna-e53dba.club/c/test-horse/lol#comment_wrapper_101784330",
						notifiable: {
							id: 101784330,
							post_id: 31957125,
							parent_comment_id: null,
							community_id: 517885,
							space_id: 2598628,
						},
					},
				],
			}),
		);

		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: null,
		});

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.data.items[0]).toMatchObject({
			id: "38122882518",
			type: "comment",
			spaceTitle: "Test Horse",
			displayAction: "commented on your post:",
			subject: {
				kind: "comment",
				id: "101784330",
				spaceId: "2598628",
				title: "Lol",
			},
			text: "Lol",
		});
	});

	it("returns empty items + null cursor on 200 with no records", async () => {
		vi.stubGlobal("fetch", mockFetchJson(200, { records: [], has_next_page: false }));

		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: "99",
		});

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.data.items).toEqual([]);
		expect(outcome.data.nextCursor).toBeNull();
	});

	it("maps 404 to not_found / not retriable", async () => {
		vi.stubGlobal("fetch", mockFetchJson(404, {}));
		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: null,
		});
		expect(outcome).toMatchObject({ ok: false, reason: "not_found", retriable: false });
	});

	it("maps 500 to server_error / retriable", async () => {
		vi.stubGlobal("fetch", mockFetchJson(500, {}));
		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: null,
		});
		expect(outcome).toMatchObject({ ok: false, reason: "server_error", retriable: true });
	});

	it("maps fetch network errors to network / retriable", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")));
		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: null,
		});
		expect(outcome).toMatchObject({ ok: false, reason: "network", retriable: true });
	});

	it("propagates sinceNotificationId as after_id query param", async () => {
		const fetchMock = mockFetchJson(200, { records: [] });
		vi.stubGlobal("fetch", fetchMock);

		await svc.getMemberNotifications("42", { sinceNotificationId: "1234" });

		const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
		expect(calledUrl).toContain("after_id=1234");
	});

	it("defaults per_page to 50 when limit is omitted", async () => {
		const fetchMock = mockFetchJson(200, { records: [] });
		vi.stubGlobal("fetch", fetchMock);

		await svc.getMemberNotifications("42", { sinceNotificationId: null });

		const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
		expect(calledUrl).toContain("per_page=50");
	});

	it("honors custom limit via per_page", async () => {
		const fetchMock = mockFetchJson(200, { records: [] });
		vi.stubGlobal("fetch", fetchMock);

		await svc.getMemberNotifications("42", { sinceNotificationId: null, limit: 10 });

		const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
		expect(calledUrl).toContain("per_page=10");
	});

	it("calls against the constructor-provided base URL", async () => {
		const customBase = "http://mock-host.test:9999";
		const customSvc = new MockServerCircleService({
			baseUrl: customBase,
			adminToken: "a",
			appToken: "b",
		});
		vi.spyOn(customSvc, "getMemberToken").mockResolvedValue({
			ok: true,
			data: {
				accessToken: "jwt",
				refreshToken: "r",
				expiresAt: "2026-06-10T12:00:00.000Z",
			},
		});

		const fetchMock = mockFetchJson(200, { records: [] });
		vi.stubGlobal("fetch", fetchMock);

		await customSvc.getMemberNotifications("42", { sinceNotificationId: null });

		const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
		expect(calledUrl).toContain(customBase);
		expect(calledUrl).toContain("/api/headless/v1/notifications");
	});

	it("token mint failure propagates (notifications fetch not called)", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(svc, "getMemberToken").mockResolvedValueOnce({
			ok: false,
			reason: "server_error",
			retriable: true,
			raw: new Error("token mint failed"),
		});

		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: null,
		});

		expect(outcome).toMatchObject({
			ok: false,
			reason: "server_error",
			retriable: true,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sorts items by id ascending and sets nextCursor to last id", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchJson(200, {
				records: [
					{ id: 102, notification_type: "post_created", created_at: "t3", subject: { type: "post", id: 3 }, text: "" },
					{ id: 100, notification_type: "post_created", created_at: "t1", subject: { type: "post", id: 1 }, text: "" },
					{ id: 101, notification_type: "post_created", created_at: "t2", subject: { type: "post", id: 2 }, text: "" },
				],
			}),
		);

		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: null,
		});
		if (!outcome.ok) throw new Error("expected ok");
		expect(outcome.data.items.map((i) => i.id)).toEqual(["100", "101", "102"]);
		expect(outcome.data.nextCursor).toBe("102");
	});

	it("filters out stale/replayed records at or before the saved cursor", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchJson(200, {
				records: [
					{ id: 100, notification_type: "post_created", created_at: "t1", subject: { type: "post", id: 1 }, text: "old" },
					{ id: 101, notification_type: "post_created", created_at: "t2", subject: { type: "post", id: 2 }, text: "new" },
					{ id: 102, notification_type: "post_created", created_at: "t3", subject: { type: "post", id: 3 }, text: "newest" },
				],
			}),
		);

		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: "100",
		});

		if (!outcome.ok) throw new Error("expected ok");
		expect(outcome.data.items.map((i) => i.id)).toEqual(["101", "102"]);
		expect(outcome.data.nextCursor).toBe("102");
		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.stringContaining("Filtered stale/replayed notifications locally"),
			expect.objectContaining({
				sinceNotificationId: "100",
				returnedCount: 3,
				filteredCount: 2,
			}),
		);
	});

	it("preserves the saved cursor when the whole page is stale replay", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchJson(200, {
				records: [
					{ id: 100, notification_type: "post_created", created_at: "t1", subject: { type: "post", id: 1 }, text: "old" },
					{ id: 101, notification_type: "post_created", created_at: "t2", subject: { type: "post", id: 2 }, text: "old" },
				],
			}),
		);

		const outcome = await svc.getMemberNotifications("42", {
			sinceNotificationId: "101",
		});

		if (!outcome.ok) throw new Error("expected ok");
		expect(outcome.data.items).toEqual([]);
		expect(outcome.data.nextCursor).toBe("101");
	});
});
