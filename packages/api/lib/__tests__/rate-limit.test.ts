/**
 * S5-06: Auth endpoint rate limiting.
 *
 * Cases:
 *   getClientIp        — x-forwarded-for first hop, x-real-ip fallback, unknown
 *   classifyAuthPath   — email / signIn / general tiers (incl. /sign-in/magic-link → email)
 *   checkAuthRateLimit — env missing (allow), under limit, over limit (429 + retryAfter),
 *                        distinct IPs isolated, Redis throws (fail open)
 *
 * @see Architecture/specs/S5-06-auth-rate-limiting.md
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// All implementations are defined once here and never reset, so they survive
// across tests. Only `limit`'s return value changes per test.
const mocks = vi.hoisted(() => {
	const limit = vi.fn();
	// Must be `function` (not arrow) so the SUT can call them with `new`.
	const RatelimitCtor = vi.fn(function RatelimitMock() {
		return { limit };
	});
	(RatelimitCtor as unknown as { slidingWindow: () => unknown }).slidingWindow = () => ({});
	const RedisCtor = vi.fn(function RedisMock() {
		return {};
	});
	return { limit, RatelimitCtor, RedisCtor };
});

vi.mock("@repo/logs", () => ({
	logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn() },
}));

vi.mock("@upstash/redis", () => ({ Redis: mocks.RedisCtor }));

vi.mock("@upstash/ratelimit", () => ({ Ratelimit: mocks.RatelimitCtor }));

import {
	__resetRateLimiterForTests,
	checkAuthRateLimit,
	classifyAuthPath,
	getClientIp,
} from "../rate-limit";

beforeEach(() => {
	mocks.limit.mockReset();
	__resetRateLimiterForTests(); // clear lazy singletons so env changes take effect
	delete process.env.UPSTASH_REDIS_REST_URL;
	delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

function enableUpstash() {
	process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
	process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
}

describe("getClientIp", () => {
	it("prefers the first hop of x-forwarded-for", async () => {
		const headers = new Headers({
			"x-forwarded-for": "1.1.1.1, 2.2.2.2",
			"x-real-ip": "9.9.9.9",
		});
		expect(getClientIp(headers)).toBe("1.1.1.1");
	});

	it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
		expect(getClientIp(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
	});

	it("returns 'unknown' when neither header is present", async () => {
		expect(getClientIp(new Headers())).toBe("unknown");
	});
});

describe("classifyAuthPath", () => {
	it("routes email-sending endpoints to the email tier", async () => {
		expect(classifyAuthPath("/api/auth/forget-password")).toBe("email");
		expect(classifyAuthPath("/api/auth/sign-in/magic-link")).toBe("email");
		expect(classifyAuthPath("/api/auth/send-verification-email")).toBe("email");
		expect(classifyAuthPath("/api/auth/sign-up/email")).toBe("email");
	});

	it("routes credential / token-consuming endpoints to the signIn tier", async () => {
		expect(classifyAuthPath("/api/auth/sign-in/email")).toBe("signIn");
		expect(classifyAuthPath("/api/auth/reset-password")).toBe("signIn");
		expect(classifyAuthPath("/api/auth/magic-link/verify")).toBe("signIn");
		expect(classifyAuthPath("/api/auth/verify-email")).toBe("signIn");
	});

	it("routes everything else (e.g. session reads) to the general tier", async () => {
		expect(classifyAuthPath("/api/auth/get-session")).toBe("general");
		expect(classifyAuthPath("/api/auth/list-sessions")).toBe("general");
	});
});

describe("checkAuthRateLimit", () => {
	it("allows the request when Upstash env is not configured", async () => {
		const verdict = await checkAuthRateLimit("/api/auth/sign-in/email", new Headers());
		expect(verdict.ok).toBe(true);
		expect(mocks.limit).not.toHaveBeenCalled();
	});

	it("allows a request that is under the limit", async () => {
		enableUpstash();
		mocks.limit.mockResolvedValue({ success: true, remaining: 9, reset: Date.now() + 10_000 });

		const verdict = await checkAuthRateLimit(
			"/api/auth/get-session",
			new Headers({ "x-real-ip": "1.2.3.4" }),
		);

		expect(verdict.ok).toBe(true);
		expect(verdict.remaining).toBe(9);
		expect(mocks.limit).toHaveBeenCalledWith("1.2.3.4");
	});

	it("blocks an over-limit request with a Retry-After value", async () => {
		enableUpstash();
		mocks.limit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 30_000 });

		const verdict = await checkAuthRateLimit(
			"/api/auth/sign-in/email",
			new Headers({ "x-real-ip": "1.2.3.4" }),
		);

		expect(verdict.ok).toBe(false);
		expect(verdict.retryAfter).toBeGreaterThan(28);
		expect(verdict.retryAfter).toBeLessThanOrEqual(30);
	});

	it("keeps independent counters per IP", async () => {
		enableUpstash();
		mocks.limit.mockResolvedValue({ success: true, remaining: 9, reset: Date.now() + 10_000 });

		await checkAuthRateLimit("/api/auth/get-session", new Headers({ "x-real-ip": "1.1.1.1" }));
		await checkAuthRateLimit("/api/auth/get-session", new Headers({ "x-real-ip": "2.2.2.2" }));

		expect(mocks.limit).toHaveBeenNthCalledWith(1, "1.1.1.1");
		expect(mocks.limit).toHaveBeenNthCalledWith(2, "2.2.2.2");
	});

	it("fails open when the limiter throws", async () => {
		enableUpstash();
		mocks.limit.mockRejectedValue(new Error("redis unreachable"));

		const verdict = await checkAuthRateLimit(
			"/api/auth/sign-in/email",
			new Headers({ "x-real-ip": "1.2.3.4" }),
		);

		expect(verdict.ok).toBe(true);
	});
});
