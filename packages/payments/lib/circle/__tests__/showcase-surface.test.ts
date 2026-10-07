/**
 * S13-17: member-token comment / like / RSVP, deleteSpace, and createPost's
 * skipNotifications flag — the Circle surface the staging showcase script uses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@circleco/headless-server-sdk", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { RealCircleService } from "../real";

function makeService() {
	const service = new RealCircleService("admin-token", "headless-app-token");
	vi.spyOn(service, "getMemberToken").mockResolvedValue({
		ok: true,
		data: { accessToken: "member-jwt", refreshToken: "r", expiresAt: "2099-01-01T00:00:00Z" },
	});
	return service;
}

function res(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body),
		headers: { get: (k: string) => headers[k] ?? null },
	};
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("createPost skipNotifications", () => {
	it("sends skip_notifications only when set", async () => {
		const fetchMock = vi.fn().mockResolvedValue(res(200, { post: { id: 1 } }));
		vi.stubGlobal("fetch", fetchMock);
		const service = makeService();
		const base = {
			spaceId: "5",
			name: "n",
			tiptapBody: { body: { type: "doc" as const, content: [] } },
		};
		await service.createPost({ ...base, skipNotifications: true });
		await service.createPost(base);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body).skip_notifications).toBe(true);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty(
			"skip_notifications",
		);
	});
});

describe("createComment", () => {
	it("posts the wrapped comment body with the member token and returns the id", async () => {
		const fetchMock = vi.fn().mockResolvedValue(res(201, { id: 77 }));
		vi.stubGlobal("fetch", fetchMock);
		const out = await makeService().createComment({
			circlePostId: "9",
			circleMemberId: "3",
			body: "Lovely",
		});
		expect(out).toEqual({ ok: true, data: { circleCommentId: "77" } });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://app.circle.so/api/headless/v1/posts/9/comments");
		expect(init.headers.Authorization).toBe("Bearer member-jwt");
		expect(JSON.parse(init.body).comment.body).toBe("Lovely");
	});

	it("surfaces retryAfterMs on 429", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(429, {}, { "Retry-After": "12" })));
		const out = await makeService().createComment({
			circlePostId: "9",
			circleMemberId: "3",
			body: "x",
		});
		expect(out).toMatchObject({ ok: false, reason: "rate_limited", retryAfterMs: 12_000 });
	});
});

describe("likePost / rsvpEvent", () => {
	it("treats an already-liked 4xx as success but not a 401", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(res(422)).mockResolvedValueOnce(res(401));
		vi.stubGlobal("fetch", fetchMock);
		const service = makeService();
		expect((await service.likePost({ circlePostId: "1", circleMemberId: "2" })).ok).toBe(true);
		expect(await service.likePost({ circlePostId: "1", circleMemberId: "2" })).toMatchObject({
			ok: false,
			reason: "auth",
		});
	});

	it("RSVPs via POST event_attendees and treats 409 as success", async () => {
		const fetchMock = vi.fn().mockResolvedValue(res(409));
		vi.stubGlobal("fetch", fetchMock);
		const out = await makeService().rsvpEvent({ eventId: "4", circleMemberId: "2" });
		expect(out.ok).toBe(true);
		expect(fetchMock.mock.calls[0][0]).toBe(
			"https://app.circle.so/api/headless/v1/events/4/event_attendees",
		);
		expect(fetchMock.mock.calls[0][1].method).toBe("POST");
	});
});

describe("deleteSpace", () => {
	it("DELETEs the admin space and treats 404 as success", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(res(200))
			.mockResolvedValueOnce(res(404))
			.mockResolvedValueOnce(res(500));
		vi.stubGlobal("fetch", fetchMock);
		const service = makeService();
		expect((await service.deleteSpace("8")).ok).toBe(true);
		expect((await service.deleteSpace("8")).ok).toBe(true);
		expect((await service.deleteSpace("8")).ok).toBe(false);
		expect(fetchMock.mock.calls[0][0]).toBe("https://app.circle.so/api/admin/v2/spaces/8");
		expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
	});
});
