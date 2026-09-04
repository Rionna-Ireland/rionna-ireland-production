/**
 * Member-token space listing + short-lived cache (S12-02a).
 *
 * Mirrors `packages/api/modules/circle/lib/member-feed-cache.ts`: a module-level
 * Map keyed by member, TTL'd short so repeated composer opens within the window
 * cost zero Circle calls, but a newly-granted space shows up quickly.
 *
 * IMPORTANT: `/spaces` (member token) returns a bare array, not `{ records: [...] }`
 * — never use Circle's `/home` aggregate endpoint (401s for headless members).
 */

import { logger } from "@repo/logs";
import { getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";

import { objectValue, textValue } from "../../circle/lib/parse-post";
import { MEMBER_SPACES_CACHE_MAX_ENTRIES, MEMBER_SPACES_CACHE_TTL_MS } from "./limits";
import type { MemberSpace } from "./types";

function booleanValue(value: unknown): boolean {
	return value === true;
}

function idValue(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	return null;
}

function parseMemberSpace(raw: Record<string, unknown>): MemberSpace | null {
	const id = idValue(raw.id);
	if (!id) return null;
	const policies = objectValue(raw.policies);
	return {
		id,
		name: textValue(raw.name) ?? "",
		emoji: textValue(raw.emoji),
		canCreatePost: booleanValue(policies?.can_create_post),
		isMember: booleanValue(raw.is_member),
		spaceGroupId: idValue(raw.space_group_id),
		isPostDisabled: booleanValue(raw.is_post_disabled),
		spaceType: textValue(raw.space_type),
	};
}

/**
 * Fetch the member's accessible spaces via the Circle headless member API.
 * Returns null on any network failure or non-OK response (incl. 401) — never
 * throws, so callers can fail the request without a stack trace leaking Circle
 * shape.
 */
export async function fetchMemberSpaces(p: {
	accessToken: string;
}): Promise<MemberSpace[] | null> {
	const base = getCircleHeadlessApiBaseUrl();
	let res: Response;
	try {
		res = await fetch(`${base}/spaces?per_page=100`, {
			headers: { Authorization: `Bearer ${p.accessToken}` },
		});
	} catch (error) {
		logger.warn("[Community] Member spaces fetch threw", {
			surface: "community.member_spaces",
			error: String(error),
		});
		return null;
	}
	if (!res.ok) {
		logger.warn("[Community] Member spaces fetch failed", {
			surface: "community.member_spaces",
			status: res.status,
		});
		return null;
	}
	const body: unknown = await res.json();
	const rawSpaces = Array.isArray(body) ? body : [];
	const spaces: MemberSpace[] = [];
	for (const entry of rawSpaces) {
		const obj = objectValue(entry);
		if (!obj) continue;
		const parsed = parseMemberSpace(obj);
		if (parsed) spaces.push(parsed);
	}
	return spaces;
}

interface CacheEntry {
	spaces: MemberSpace[];
	expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, organizationId: string): string {
	return `${userId}:${organizationId}`;
}

/** Cached postable-space listing for this member, or undefined on miss/expiry. */
export function getMemberSpacesCached(
	userId: string,
	organizationId: string,
): MemberSpace[] | undefined {
	const key = cacheKey(userId, organizationId);
	const entry = cache.get(key);
	if (!entry) return undefined;
	if (entry.expiresAt <= Date.now()) {
		cache.delete(key);
		return undefined;
	}
	return entry.spaces;
}

export function writeMemberSpacesCache(
	userId: string,
	organizationId: string,
	spaces: MemberSpace[],
): void {
	if (cache.size >= MEMBER_SPACES_CACHE_MAX_ENTRIES) {
		const now = Date.now();
		for (const [key, entry] of cache) {
			if (entry.expiresAt <= now) {
				cache.delete(key);
			}
		}
		while (cache.size >= MEMBER_SPACES_CACHE_MAX_ENTRIES) {
			const oldest = cache.keys().next().value;
			if (oldest === undefined) break;
			cache.delete(oldest);
		}
	}
	cache.set(cacheKey(userId, organizationId), {
		spaces,
		expiresAt: Date.now() + MEMBER_SPACES_CACHE_TTL_MS,
	});
}

export function invalidateMemberSpacesCache(userId: string, organizationId: string): void {
	cache.delete(cacheKey(userId, organizationId));
}

/** Drop every cached entry. Test-only helper. */
export function clearMemberSpacesCacheForTests(): void {
	cache.clear();
}
