import { logger } from "@repo/logs";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Shared Upstash rate-limit core (server-only). Import it from
 * `@repo/utils/lib/rate-limit`; it is deliberately NOT re-exported from the
 * `@repo/utils` index so client bundles never pull in the Upstash SDK.
 *
 * Serverless has no shared memory, so counters live in Upstash Redis
 * (REST-based, works across all function instances). Everything is lazily
 * initialised on first use — no Redis client is constructed at module load —
 * and the limiter always **fails open**: any error, or a missing config,
 * resolves to "allow" so a limiter outage can never take down a surface.
 *
 * @see Architecture/specs/S5-06-auth-rate-limiting.md
 * @see Architecture/specs/S12-09-waitlist-landing.md
 */

export interface RateLimitVerdict {
	ok: boolean;
	retryAfter?: number; // seconds
	remaining?: number;
	reset?: number; // unix ms
}

export interface RateLimitOptions {
	/** Redis key prefix, e.g. `rl:waitlist:ip`. One limiter per prefix. */
	prefix: string;
	/** What is being limited (IP, email, …). */
	key: string;
	/** Max requests per window. */
	limit: number;
	/** Sliding window length in seconds. */
	windowSeconds: number;
}

// `undefined` = not yet resolved, `null` = unavailable (missing env / construction failed).
let redisClient: Redis | null | undefined;
let warnedMissingConfig = false;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
	if (redisClient !== undefined) {
		return redisClient;
	}

	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;

	if (!url || !token) {
		if (!warnedMissingConfig) {
			logger.warn("Rate limiting disabled: UPSTASH_REDIS_REST_* not set");
			warnedMissingConfig = true;
		}
		redisClient = null;
		return null;
	}

	redisClient = new Redis({ url, token });
	return redisClient;
}

function getLimiter(redis: Redis, { prefix, limit, windowSeconds }: RateLimitOptions): Ratelimit {
	const cacheKey = `${prefix}|${limit}|${windowSeconds}`;
	let limiter = limiters.get(cacheKey);
	if (!limiter) {
		limiter = new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
			prefix,
		});
		limiters.set(cacheKey, limiter);
	}
	return limiter;
}

/**
 * Sliding-window check for `key` under `prefix`. Fails open: resolves
 * `{ ok: true }` when Upstash is not configured or the limiter throws.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitVerdict> {
	try {
		const redis = getRedis();
		if (!redis) {
			return { ok: true }; // no store configured -> allow
		}

		const { success, remaining, reset } = await getLimiter(redis, options).limit(options.key);

		return {
			ok: success,
			retryAfter: success ? undefined : Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
			remaining,
			reset,
		};
	} catch (error) {
		// Fail open — availability outweighs limiter strictness.
		logger.error(error, { ctx: "checkRateLimit", prefix: options.prefix });
		return { ok: true };
	}
}

/**
 * Vercel sits behind a proxy, so the request has no real client IP.
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

/** @internal Test-only: clears the lazy singletons so env changes take effect. */
export function __resetRateLimitForTests(): void {
	redisClient = undefined;
	warnedMissingConfig = false;
	limiters.clear();
}
