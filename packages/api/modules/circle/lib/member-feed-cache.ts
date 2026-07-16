/**
 * Member feed buffer cache (FABLE_AUDIT P4 / C8)
 *
 * `getMemberFeed` fans out to Circle (1 `/spaces` + up to MAX_SPACES
 * `/spaces/{id}/posts` calls) and merges the results — and it used to redo
 * the whole fan-out for every page of the same feed. This module caches the
 * merged, follow-filtered buffer per member for a short TTL so:
 *
 * - "load more" pages slice the same buffer instead of re-fanning out
 *   (which also fixes the offset-pagination duplicate/skip bug — the buffer
 *   can't shift between page 1 and page 2 within the TTL), and
 * - members refreshing the feed within the TTL cost zero Circle calls.
 *
 * A module-level Map is deliberate: at single-club scale (~100s of members)
 * a warm serverless instance handles many requests, and a lost cache on
 * cold start just means one rebuild. Failed builds are never cached.
 *
 * Follow/unfollow invalidates the member's buffer so filter changes are
 * visible immediately rather than after the TTL.
 */

import type { MemberFeedItem } from "./parse-post";

interface FeedCacheEntry {
	merged: MemberFeedItem[];
	expiresAt: number;
}

const TTL_MS = 60_000;
/** Safety cap so the map can't grow unbounded on a long-lived instance. */
const MAX_ENTRIES = 1_000;

const cache = new Map<string, FeedCacheEntry>();

function cacheKey(userId: string, organizationId: string): string {
	return `${organizationId}:${userId}`;
}

/** The merged feed buffer for this member, or null on miss/expiry. */
export function readMemberFeedBuffer(
	userId: string,
	organizationId: string,
): MemberFeedItem[] | null {
	const entry = cache.get(cacheKey(userId, organizationId));
	if (!entry) {
		return null;
	}
	if (entry.expiresAt <= Date.now()) {
		cache.delete(cacheKey(userId, organizationId));
		return null;
	}
	return entry.merged;
}

export function writeMemberFeedBuffer(
	userId: string,
	organizationId: string,
	merged: MemberFeedItem[],
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
	cache.set(cacheKey(userId, organizationId), {
		merged,
		expiresAt: Date.now() + TTL_MS,
	});
}

/** Drop one member's buffer (e.g. after a follow/unfollow changes the filter). */
export function invalidateMemberFeedCache(userId: string, organizationId: string): void {
	cache.delete(cacheKey(userId, organizationId));
}

/** Drop every buffer. */
export function clearMemberFeedCache(): void {
	cache.clear();
}
