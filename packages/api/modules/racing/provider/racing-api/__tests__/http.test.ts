import { afterEach, describe, expect, it, vi } from "vitest";
import { RacingApiHttp, TokenBucket } from "../http";

describe("TokenBucket", () => {
	it("allows up to `rate` calls immediately, then spaces the rest", async () => {
		vi.useFakeTimers();
		const bucket = new TokenBucket(5, 1000); // 5 tokens per 1000ms
		const started = Date.now();
		// 5 immediate
		for (let i = 0; i < 5; i++) await bucket.take();
		expect(Date.now() - started).toBe(0);
		// 6th must wait for a refill tick
		const p = bucket.take();
		await vi.advanceTimersByTimeAsync(200);
		await p;
		expect(Date.now() - started).toBeGreaterThanOrEqual(200);
		vi.useRealTimers();
	});
});

describe("RacingApiHttp.getJson", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("throws an error including the path on a non-OK response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("nope", { status: 404 }),
		);
		const http = new RacingApiHttp({ username: "u", password: "p" });
		await expect(http.getJson("/v1/courses")).rejects.toThrow(
			"Racing API /v1/courses -> HTTP 404",
		);
	});

	it("throws a contextful error when a 2xx body is not valid JSON", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("", { status: 200 }),
		);
		const http = new RacingApiHttp({ username: "u", password: "p" });
		await expect(http.getJson("/v1/courses")).rejects.toThrow(
			"Racing API /v1/courses -> invalid JSON response",
		);
	});
});
