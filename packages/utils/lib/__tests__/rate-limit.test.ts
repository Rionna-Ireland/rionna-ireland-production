import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const limit = vi.fn();
	// Must be `function` (not arrow) so the SUT can call them with `new`.
	const RatelimitCtor = vi.fn(function RatelimitMock() {
		return { limit };
	});
	const slidingWindow = vi.fn(() => ({}));
	(RatelimitCtor as unknown as { slidingWindow: typeof slidingWindow }).slidingWindow =
		slidingWindow;
	const RedisCtor = vi.fn(function RedisMock() {
		return {};
	});
	return { limit, RatelimitCtor, RedisCtor, slidingWindow };
});

vi.mock("@repo/logs", () => ({
	logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn() },
}));
vi.mock("@upstash/redis", () => ({ Redis: mocks.RedisCtor }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: mocks.RatelimitCtor }));

import { __resetRateLimitForTests, checkRateLimit, getClientIp } from "../rate-limit";

const opts = { prefix: "rl:test", key: "1.2.3.4", limit: 5, windowSeconds: 600 };

beforeEach(() => {
	mocks.limit.mockReset();
	mocks.RatelimitCtor.mockClear();
	__resetRateLimitForTests();
	delete process.env.UPSTASH_REDIS_REST_URL;
	delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

function enableUpstash() {
	process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
	process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
}

describe("checkRateLimit", () => {
	it("allows when Upstash is not configured", async () => {
		expect(await checkRateLimit(opts)).toEqual({ ok: true });
		expect(mocks.limit).not.toHaveBeenCalled();
	});

	it("limits on the given key with a seconds-based sliding window", async () => {
		enableUpstash();
		mocks.limit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 1000 });

		const verdict = await checkRateLimit(opts);

		expect(verdict.ok).toBe(true);
		expect(mocks.limit).toHaveBeenCalledWith("1.2.3.4");
		expect(mocks.slidingWindow).toHaveBeenCalledWith(5, "600 s");
	});

	it("reuses one limiter per prefix/limit/window", async () => {
		enableUpstash();
		mocks.limit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 1000 });

		await checkRateLimit(opts);
		await checkRateLimit({ ...opts, key: "other" });
		await checkRateLimit({ ...opts, prefix: "rl:other" });

		expect(mocks.RatelimitCtor).toHaveBeenCalledTimes(2);
	});

	it("blocks over-limit requests with retryAfter", async () => {
		enableUpstash();
		mocks.limit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 30_000 });

		const verdict = await checkRateLimit(opts);

		expect(verdict.ok).toBe(false);
		expect(verdict.retryAfter).toBeGreaterThan(28);
		expect(verdict.retryAfter).toBeLessThanOrEqual(30);
	});

	it("fails open when the limiter throws", async () => {
		enableUpstash();
		mocks.limit.mockRejectedValue(new Error("redis unreachable"));

		expect(await checkRateLimit(opts)).toEqual({ ok: true });
	});
});

describe("getClientIp", () => {
	it("prefers the first x-forwarded-for hop, then x-real-ip, then 'unknown'", () => {
		expect(getClientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
		expect(getClientIp(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
		expect(getClientIp(new Headers())).toBe("unknown");
	});
});
