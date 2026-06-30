import { describe, it, expect, vi } from "vitest";
import { TokenBucket } from "../http";

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
