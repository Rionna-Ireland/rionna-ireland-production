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
let emailLimiter: Ratelimit | null = null;
let signInLimiter: Ratelimit | null = null;
let generalLimiter: Ratelimit | null = null;
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

type AuthRateTier = "email" | "signIn" | "general";

type AuthLimiters = Record<AuthRateTier, Ratelimit>;

function getLimiters(): AuthLimiters | null {
	const redis = getRedis();
	if (!redis) {
		return null;
	}

	// Tightest: each of these sends an email (reset / magic-link / verification /
	// signup), so abuse costs money and spams a victim's inbox.
	emailLimiter ??= new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(3, "5 m"),
		prefix: "rl:auth:email",
	});
	// Credential-stuffing / token-consuming mutations.
	signInLimiter ??= new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(10, "1 m"),
		prefix: "rl:auth:signin",
	});
	// Everything else under /auth/** — notably `/get-session`, which the frontend
	// (TanStack Query) refetches often. Generous so shared NAT/CGNAT IPs don't
	// throttle real users.
	generalLimiter ??= new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(60, "1 m"),
		prefix: "rl:auth:general",
	});

	return { email: emailLimiter, signIn: signInLimiter, general: generalLimiter };
}

/**
 * Classify an auth request path into a rate-limit tier. Matched against the full
 * request path (e.g. `/api/auth/sign-in/email`) via substring, so the leading
 * basePath is irrelevant. Email-sending endpoints are checked first because
 * `/sign-in/magic-link` would otherwise fall into the sign-in tier.
 */
const EMAIL_SENDING_SEGMENTS = [
	"/forget-password",
	"/sign-in/magic-link",
	"/send-verification-email",
	"/sign-up",
];
const SIGN_IN_SEGMENTS = ["/sign-in", "/reset-password", "/magic-link/verify", "/verify-email"];

export function classifyAuthPath(path: string): AuthRateTier {
	if (EMAIL_SENDING_SEGMENTS.some((segment) => path.includes(segment))) {
		return "email";
	}
	if (SIGN_IN_SEGMENTS.some((segment) => path.includes(segment))) {
		return "signIn";
	}
	return "general";
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
		const limiter = limiters[classifyAuthPath(path)];

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
	emailLimiter = null;
	signInLimiter = null;
	generalLimiter = null;
	warnedMissingConfig = false;
}
