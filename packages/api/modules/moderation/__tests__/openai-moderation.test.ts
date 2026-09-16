import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classifyText } from "../openai-moderation";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;
const fetchMock = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	process.env.OPENAI_API_KEY = "sk-test";
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

function okResponse(body: unknown) {
	return { ok: true, status: 200, json: async () => body };
}

describe("classifyText", () => {
	it("posts to the moderations endpoint with the omni model and returns category scores", async () => {
		fetchMock.mockResolvedValue(
			okResponse({ results: [{ flagged: true, category_scores: { hate: 0.9, violence: 0.1 } }] }),
		);

		const result = await classifyText("some text");

		expect(result).toEqual({ ok: true, scores: { hate: 0.9, violence: 0.1 } });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://api.openai.com/v1/moderations");
		expect(init.method).toBe("POST");
		expect(init.headers).toMatchObject({ Authorization: "Bearer sk-test", "Content-Type": "application/json" });
		expect(JSON.parse(init.body)).toEqual({ model: "omni-moderation-latest", input: "some text" });
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it("returns no_key without calling fetch when OPENAI_API_KEY is unset", async () => {
		delete process.env.OPENAI_API_KEY;
		expect(await classifyText("x")).toEqual({ ok: false, reason: "no_key" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns http_error with the status on a non-2xx (e.g. 429 with no credit)", async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
		expect(await classifyText("x")).toEqual({ ok: false, reason: "http_error", status: 429 });
	});

	it("returns timeout when the request aborts", async () => {
		fetchMock.mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
		expect(await classifyText("x")).toEqual({ ok: false, reason: "timeout" });
	});

	it("returns http_error on a network failure", async () => {
		fetchMock.mockRejectedValue(new TypeError("fetch failed"));
		expect(await classifyText("x")).toEqual({ ok: false, reason: "http_error" });
	});

	it("returns bad_response when the body has no category_scores", async () => {
		fetchMock.mockResolvedValue(okResponse({ results: [] }));
		expect(await classifyText("x")).toEqual({ ok: false, reason: "bad_response" });
	});
});
