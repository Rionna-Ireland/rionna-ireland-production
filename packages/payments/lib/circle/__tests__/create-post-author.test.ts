/**
 * S12-02a Task 4: createPost author override + admin deleteComment.
 *
 * createPost: when CreatePostParams.authorEmail is set, the Admin API v2
 * body gains `user_email` — Circle then authors the post as that member
 * (community_member_id is silently ignored). Omitted key when unset.
 *
 * deleteComment: Task 1 ruled the admin_v2 route — DELETE
 * https://app.circle.so/api/admin/v2/comments/{comment_id} — mirrors
 * deletePost's structure/outcome mapping (200 -> ok, 404 -> not_found treated
 * as already-gone success... actually not_found is a failure per brief).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@circleco/headless-server-sdk", () => ({
	createClient: vi.fn(() => ({})),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { RealCircleService } from "../real";

function makeService() {
	return new RealCircleService("admin-token", "headless-app-token");
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("RealCircleService.createPost — authorEmail", () => {
	it("adds user_email to the request body when authorEmail is set", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ post: { id: 42, status: "published" } }),
		});
		vi.stubGlobal("fetch", fetchMock);

		await makeService().createPost({
			spaceId: "1",
			name: "Race day",
			tiptapBody: { body: { type: "doc", content: [] } },
			authorEmail: "a@b.ie",
		});

		const call = fetchMock.mock.calls[0];
		const requestInit = call?.[1] as { body: string };
		const body = JSON.parse(requestInit.body) as Record<string, unknown>;
		expect(body.user_email).toBe("a@b.ie");
	});

	it("omits user_email when authorEmail is not set", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ post: { id: 42, status: "published" } }),
		});
		vi.stubGlobal("fetch", fetchMock);

		await makeService().createPost({
			spaceId: "1",
			name: "Race day",
			tiptapBody: { body: { type: "doc", content: [] } },
		});

		const call = fetchMock.mock.calls[0];
		const requestInit = call?.[1] as { body: string };
		const body = JSON.parse(requestInit.body) as Record<string, unknown>;
		expect(body).not.toHaveProperty("user_email");
	});
});

describe("RealCircleService.deleteComment", () => {
	it("issues DELETE to the admin_v2 comments route and maps 200 to ok", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => "",
		});
		vi.stubGlobal("fetch", fetchMock);

		const outcome = await makeService().deleteComment("c1");

		expect(outcome).toEqual({ ok: true, data: undefined });
		const call = fetchMock.mock.calls[0];
		expect(call?.[0]).toBe("https://app.circle.so/api/admin/v2/comments/c1");
		const requestInit = call?.[1] as { method: string; headers: Record<string, string> };
		expect(requestInit.method).toBe("DELETE");
		expect(requestInit.headers.Authorization).toBe("Bearer admin-token");
	});

	it("maps a 404 to not_found, non-retriable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				text: async () => "not found",
			}),
		);

		const outcome = await makeService().deleteComment("c1");

		expect(outcome).toEqual({
			ok: false,
			reason: "not_found",
			retriable: false,
			raw: "not found",
		});
	});

	it("returns a network failure without throwing", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

		const outcome = await makeService().deleteComment("c1");

		expect(outcome.ok).toBe(false);
		if (outcome.ok) throw new Error("expected failure");
		expect(outcome.reason).toBe("network");
		expect(outcome.retriable).toBe(true);
	});
});
