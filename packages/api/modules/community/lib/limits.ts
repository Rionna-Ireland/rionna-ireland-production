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

/** Longest note a member can add when reporting a post or comment. */
export const MAX_NOTE_CHARS = 500;
/** Longest content excerpt stored on a moderation flag. */
export const EXCERPT_CHARS = 200;

/** Direct-to-Circle member media (S15-01). */
export const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const POST_VIDEO_CONTENT_TYPES = ["video/mp4", "video/quicktime"] as const;
export const POST_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const MAX_POST_IMAGES = 6;
export const MAX_POST_VIDEOS = 1;
export const MEDIA_UPLOADS_PER_HOUR = 30;
/** How long a media token stays valid after the upload is registered. */
// Long enough for a slow 200 MB upload plus writing the post; tokens are member+org bound.
export const MEDIA_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
