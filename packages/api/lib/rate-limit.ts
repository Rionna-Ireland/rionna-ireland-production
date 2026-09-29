import {
	__resetRateLimitForTests,
	checkRateLimit,
	getClientIp,
	type RateLimitVerdict,
} from "@repo/utils/lib/rate-limit";

/**
 * Rate limiting for the auth surface (`/api/auth/**`) and the general API.
 *
 * The Upstash core (lazy Redis client, sliding windows, fail-open) lives in
 * `@repo/utils/lib/rate-limit` so apps without a `@repo/api` dependency
 * (marketing) can share it. This module keeps the API-specific tiers.
 *
 * @see Architecture/specs/S5-06-auth-rate-limiting.md
 */

export { getClientIp, type RateLimitVerdict };

type AuthRateTier = "email" | "signIn" | "general";

const AUTH_TIERS: Record<AuthRateTier, { prefix: string; limit: number; windowSeconds: number }> = {
	// Tightest: each of these sends an email (reset / magic-link / verification /
	// signup), so abuse costs money and spams a victim's inbox.
	email: { prefix: "rl:auth:email", limit: 3, windowSeconds: 5 * 60 },
	// Credential-stuffing / token-consuming mutations.
	signIn: { prefix: "rl:auth:signin", limit: 10, windowSeconds: 60 },
	// Everything else under /auth/** — notably `/get-session`, which the frontend
	// (TanStack Query) refetches often. Generous so shared NAT/CGNAT IPs don't
	// throttle real users.
	general: { prefix: "rl:auth:general", limit: 60, windowSeconds: 60 },
};

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

/** Per-IP auth limiter. Fails open (see `checkRateLimit`). */
export function checkAuthRateLimit(path: string, headers: Headers): Promise<RateLimitVerdict> {
	return checkRateLimit({ ...AUTH_TIERS[classifyAuthPath(path)], key: getClientIp(headers) });
}

/**
 * Rate limit for the general API surface — the oRPC/OpenAPI handlers behind
 * `/rpc` and `/api` (FABLE_AUDIT F2 / S5-07 item 8). Generous per-IP sliding
 * window: the app is chatty (feed, badge polls) but not 100-req/min chatty,
 * while unauthenticated `publicProcedure`s stop being free enumeration/DoS
 * targets. Same fail-open semantics as the auth limiter.
 */
export function checkApiRateLimit(headers: Headers): Promise<RateLimitVerdict> {
	return checkRateLimit({
		prefix: "rl:api",
		key: getClientIp(headers),
		limit: 100,
		windowSeconds: 60,
	});
}

/** @internal Test-only: clears the lazy singletons so env changes take effect. */
export function __resetRateLimiterForTests(): void {
	__resetRateLimitForTests();
}
