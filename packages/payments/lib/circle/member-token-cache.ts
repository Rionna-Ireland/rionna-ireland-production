/**
 * Circle member token cache (FABLE_AUDIT P3)
 *
 * Circle member JWTs live ~1 hour but were minted fresh on every request —
 * feed, badge count, session token, trainer posts, member post, and the
 * notification poller each paid a Circle round-trip per call, making token
 * mints the dominant Circle quota consumer.
 *
 * This cache persists the minted token on the Member row
 * (`circleAccessToken` / `circleAccessTokenExpiresAt`) and reuses it until
 * shortly before expiry. Every path fails open: a DB error never blocks a
 * mint, and clearing is best-effort.
 *
 * Invalidation:
 * - `revoke-session` (logout) clears the cache — the revoked token must not
 *   be served to server-side consumers afterwards.
 * - `getMemberNotifications` clears the cache when Circle rejects a cached
 *   token with 401, so the next tick recovers with a fresh mint.
 */

import { logger } from "@repo/logs";

import type { MemberTokenResult } from "./types";

/**
 * The db is imported lazily so that merely importing the Circle service
 * graph never instantiates Prisma (which throws without DATABASE_URL —
 * e.g. in unit tests that stub the service and never touch the cache).
 */
async function getDb() {
	const { db } = await import("@repo/database");
	return db;
}

/**
 * Tokens expiring within this window are treated as a cache miss, so a
 * caller never receives a token about to expire mid-use.
 */
export const TOKEN_FRESHNESS_MARGIN_MS = 5 * 60_000;

/**
 * Read a cached, still-fresh member token. Returns null on miss, near-expiry,
 * or any DB error (fail-open — the caller mints a fresh token).
 */
export async function readCachedMemberToken(
	circleMemberId: string,
): Promise<MemberTokenResult | null> {
	try {
		const db = await getDb();
		const member = await db.member.findFirst({
			where: { circleMemberId },
			select: {
				circleAccessToken: true,
				circleAccessTokenExpiresAt: true,
				circleRefreshToken: true,
			},
		});
		if (!member?.circleAccessToken || !member.circleAccessTokenExpiresAt) {
			return null;
		}
		if (member.circleAccessTokenExpiresAt.getTime() - Date.now() < TOKEN_FRESHNESS_MARGIN_MS) {
			return null;
		}
		return {
			accessToken: member.circleAccessToken,
			refreshToken: member.circleRefreshToken ?? "",
			expiresAt: member.circleAccessTokenExpiresAt.toISOString(),
			fromCache: true,
		};
	} catch (err) {
		logger.warn("[Circle] Member token cache read failed; minting fresh", {
			circleMemberId,
			error: err instanceof Error ? err.message : String(err),
		});
		return null;
	}
}

/**
 * Persist a freshly minted token on the Member row. Best-effort: a DB error
 * is logged and swallowed — the caller already holds a valid token.
 */
export async function persistCachedMemberToken(
	circleMemberId: string,
	token: MemberTokenResult,
): Promise<void> {
	try {
		const db = await getDb();
		await db.member.updateMany({
			where: { circleMemberId },
			data: {
				circleAccessToken: token.accessToken,
				circleRefreshToken: token.refreshToken,
				circleAccessTokenExpiresAt: new Date(token.expiresAt),
			},
		});
	} catch (err) {
		logger.warn("[Circle] Member token cache write failed", {
			circleMemberId,
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

/**
 * Drop the cached access token (e.g. after logout revoked it, or Circle
 * rejected it with 401). Best-effort; the refresh token is managed
 * separately by the session revoke flow.
 */
export async function clearCachedMemberToken(circleMemberId: string): Promise<void> {
	try {
		const db = await getDb();
		await db.member.updateMany({
			where: { circleMemberId },
			data: { circleAccessToken: null, circleAccessTokenExpiresAt: null },
		});
	} catch (err) {
		logger.warn("[Circle] Member token cache clear failed", {
			circleMemberId,
			error: err instanceof Error ? err.message : String(err),
		});
	}
}
