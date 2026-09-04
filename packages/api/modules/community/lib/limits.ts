/**
 * S12-02a member-posting constants.
 */

/** TTL for the per-member postable-spaces cache (`lib/member-spaces.ts`). */
export const MEMBER_SPACES_CACHE_TTL_MS = 60_000;

/** Safety cap so the member-spaces cache map can't grow unbounded on a long-lived instance. */
export const MEMBER_SPACES_CACHE_MAX_ENTRIES = 1_000;

/** Accepted content types for a member post image upload. */
export const POST_IMAGE_CONTENT_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
] as const;

/** Member post rate limits (`lib/rate-limit.ts`). */
export const POSTS_PER_HOUR = 5;
export const POSTS_PER_DAY = 20;

/** A post needs a title, or a body of at least this many characters. */
export const MIN_BODY_CHARS = 10;
export const MAX_TITLE_CHARS = 120;
export const MAX_BODY_CHARS = 2000;
