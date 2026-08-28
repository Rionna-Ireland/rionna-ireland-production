/**
 * Per-member events cache. Unlike Inside Track, the response embeds the
 * member's own RSVP state (`rsvped_event`), so the key is org+user+scope.
 * 60s TTL; only successful results are cached; invalidated for a member on
 * their RSVP change. Module-level Map — same serverless trade-off as
 * inside-track-cache.ts.
 */
import type { ClubEventsResult } from "./parse-event";

interface CacheEntry {
	result: ClubEventsResult;
	expiresAt: number;
}

const TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;
const cache = new Map<string, CacheEntry>();

function key(organizationId: string, userId: string, scope: string): string {
	return `${organizationId}:${userId}:${scope}`;
}

export function readEventsCache(
	organizationId: string,
	userId: string,
	scope: "upcoming" | "past",
): ClubEventsResult | null {
	const entry = cache.get(key(organizationId, userId, scope));
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		cache.delete(key(organizationId, userId, scope));
		return null;
	}
	return entry.result;
}

export function writeEventsCache(
	organizationId: string,
	userId: string,
	scope: "upcoming" | "past",
	result: ClubEventsResult,
): void {
	if (cache.size >= MAX_ENTRIES) {
		const now = Date.now();
		for (const [k, entry] of cache) {
			if (entry.expiresAt <= now) cache.delete(k);
		}
		while (cache.size >= MAX_ENTRIES) {
			const oldest = cache.keys().next().value;
			if (oldest === undefined) break;
			cache.delete(oldest);
		}
	}
	cache.set(key(organizationId, userId, scope), { result, expiresAt: Date.now() + TTL_MS });
}

/** Drop both scopes for one member (their RSVP just changed). */
export function invalidateEventsCacheForMember(organizationId: string, userId: string): void {
	cache.delete(key(organizationId, userId, "upcoming"));
	cache.delete(key(organizationId, userId, "past"));
}

export function clearEventsCache(): void {
	cache.clear();
}
