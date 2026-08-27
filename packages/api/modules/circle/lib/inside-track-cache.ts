/**
 * Inside Track response cache (S11-01 final review — Finding B3)
 *
 * `getInsideTrack` fans out to Circle (1 page fetch + up to N individual
 * pinned-post fetches for stale pins) and the result is identical for every
 * member of the org — unlike the member feed, Inside Track has no per-member
 * filtering. This module caches the successful response per organization for
 * a short TTL so repeat loads within the buffer cost zero Circle calls.
 *
 * A module-level Map is deliberate: at single-club scale a warm serverless
 * instance handles many requests, and a lost cache on cold start just means
 * one rebuild. Only successful (`ok:true`) results are cached — a Circle
 * outage must never get cached and served back for the next 60s.
 *
 * Invalidated by `setInsideTrackPins` (pin list changed) and by
 * `publishMemberPost` (a new Inside Track post was published) so changes are
 * visible immediately rather than after the TTL.
 */

import type { MemberFeedItem } from "./parse-post";

export interface CachedInsideTrackResult {
	configured: boolean;
	pinned: MemberFeedItem[];
	latest: MemberFeedItem[];
}

interface CacheEntry {
	result: CachedInsideTrackResult;
	expiresAt: number;
}

const TTL_MS = 60_000;
/** Safety cap so the map can't grow unbounded on a long-lived instance. */
const MAX_ENTRIES = 1_000;

const cache = new Map<string, CacheEntry>();

/** The cached Inside Track response for this org, or null on miss/expiry. */
export function readInsideTrackCache(organizationId: string): CachedInsideTrackResult | null {
	const entry = cache.get(organizationId);
	if (!entry) {
		return null;
	}
	if (entry.expiresAt <= Date.now()) {
		cache.delete(organizationId);
		return null;
	}
	return entry.result;
}

export function writeInsideTrackCache(
	organizationId: string,
	result: CachedInsideTrackResult,
): void {
	if (cache.size >= MAX_ENTRIES) {
		// Drop expired entries first; if that isn't enough, drop the oldest
		// insertion (Map preserves insertion order) — crude but sufficient here.
		const now = Date.now();
		for (const [key, entry] of cache) {
			if (entry.expiresAt <= now) {
				cache.delete(key);
			}
		}
		while (cache.size >= MAX_ENTRIES) {
			const oldest = cache.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			cache.delete(oldest);
		}
	}
	cache.set(organizationId, { result, expiresAt: Date.now() + TTL_MS });
}

/** Drop one org's cached response (e.g. pins changed or a new post published). */
export function invalidateInsideTrackCache(organizationId: string): void {
	cache.delete(organizationId);
}

/** Drop every cached response. */
export function clearInsideTrackCache(): void {
	cache.clear();
}
