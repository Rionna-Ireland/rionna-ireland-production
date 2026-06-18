import { logger } from "@repo/logs";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting for the auth surface (`/api/auth/**`).
 *
 * Serverless has no shared memory, so counters live in Upstash Redis
 * (REST-based, works across all function instances). Everything here is
 * lazily initialised on first request — no Redis client is constructed at
 * module load — and the limiter always **fails open**: any error, or a
 * missing config, resolves to "allow" so a limiter outage can never take
 * down login.
 *
 * @see Architecture/specs/S5-06-auth-rate-limiting.md
 */

// `undefined` = not yet resolved, `null` = unavailable (missing env / construction failed).
let redisClient: Redis | null | undefined;
let generalLimiter: Ratelimit | null = null;
let sensitiveLimiter: Ratelimit | null = null;
let warnedMissingConfig = false;

function getRedis(): Redis | null {
	if (redisClient !== undefined) {
		return redisClient;
	}

	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;

	if (!url || !token) {
		if (!warnedMissingConfig) {
			logger.warn("Auth rate limiting disabled: UPSTASH_REDIS_REST_* not set");
			warnedMissingConfig = true;
		}
		redisClient = null;
		return null;
	}

	redisClient = new Redis({ url, token });
	return redisClient;
}

interface AuthLimiters {
	general: Ratelimit;
	sensitive: Ratelimit;
}

function getLimiters(): AuthLimiters | null {
	const redis = getRedis();
	if (!redis) {
		return null;
	}

	generalLimiter ??= new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(10, "10 s"),
		prefix: "rl:auth",
	});
	sensitiveLimiter ??= new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(5, "60 s"),
		prefix: "rl:auth:sensitive",
	});

	return { general: generalLimiter, sensitive: sensitiveLimiter };
}

/**
 * Paths that get the tighter limit. Matched against the full request path
 * (e.g. `/api/auth/sign-in/email`) via substring, so the leading basePath
 * is irrelevant.
 */
const SENSITIVE_SEGMENTS = ["/sign-in", "/forget-password", "/magic-link"];

export function isSensitivePath(path: string): boolean {
	return SENSITIVE_SEGMENTS.some((segment) => path.includes(segment));
}

/**
 * Vercel sits behind a proxy, so the Hono request has no real client IP.
 * Read the first hop of `x-forwarded-for`, falling back to `x-real-ip`.
 * Unknown-IP traffic shares a single bucket (acceptable, fails safe-ish).
 */
export function getClientIp(headers: Headers): string {
	const forwardedFor = headers.get("x-forwarded-for");
	if (forwardedFor) {
		const [first] = forwardedFor.split(",");
		if (first?.trim()) {
			return first.trim();
		}
	}
	return headers.get("x-real-ip")?.trim() ?? "unknown";
}

export interface RateLimitVerdict {
	ok: boolean;
	retryAfter?: number; // seconds
	remaining?: number;
	reset?: number; // unix ms
}

export async function checkAuthRateLimit(
	path: string,
	headers: Headers,
): Promise<RateLimitVerdict> {
	try {
		const limiters = getLimiters();
		if (!limiters) {
			return { ok: true }; // no store configured -> allow
		}

		const ip = getClientIp(headers);
		const limiter = isSensitivePath(path) ? limiters.sensitive : limiters.general;

		const { success, remaining, reset } = await limiter.limit(ip);

		return {
			ok: success,
			retryAfter: success ? undefined : Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
			remaining,
			reset,
		};
	} catch (error) {
		// Fail open — auth availability outweighs limiter strictness.
		logger.error(error, { ctx: "checkAuthRateLimit" });
		return { ok: true };
	}
}

/** @internal Test-only: clears the lazy singletons so env changes take effect. */
export function __resetRateLimiterForTests(): void {
	redisClient = undefined;
	generalLimiter = null;
	sensitiveLimiter = null;
	warnedMissingConfig = false;
}
