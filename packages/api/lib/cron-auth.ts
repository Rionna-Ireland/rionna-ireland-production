import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Authorization gate for the Vercel cron route handlers
 * (`/api/cron/circle-poll`, `/api/cron/ingest`, `/api/cron/reconcile`).
 *
 * These routes trigger expensive work (Circle/Timeform polling + push
 * fan-out), so the gate **fails closed**: a request is only authorized when
 * `CRON_SECRET` is set to a non-empty value AND the `Authorization` header is
 * exactly `Bearer <CRON_SECRET>`. If the secret is unset/empty we reject
 * everything — never collapse to the literal "Bearer undefined".
 *
 * The comparison is constant-time. `crypto.timingSafeEqual` throws when the
 * two buffers differ in length, and that throw/length-mismatch is itself a
 * timing/length leak. To avoid it, both the provided token and the expected
 * value are SHA-256 hashed first: the digests are always 32 bytes, so the
 * compare never throws and length never leaks.
 *
 * @see Architecture/specs/S5-07-*.md
 */

function sha256(value: string): Buffer {
	return createHash("sha256").update(value).digest();
}

export function isAuthorizedCronRequest(request: Request): boolean {
	const secret = process.env.CRON_SECRET;

	// Fail closed: no secret configured means no caller can be authorized.
	if (!secret) {
		return false;
	}

	const authHeader = request.headers.get("authorization");
	if (!authHeader) {
		return false;
	}

	const expected = `Bearer ${secret}`;

	// Hash both sides to equal-length digests so timingSafeEqual never throws
	// and the comparison stays constant-time regardless of token length.
	return timingSafeEqual(sha256(authHeader), sha256(expected));
}
