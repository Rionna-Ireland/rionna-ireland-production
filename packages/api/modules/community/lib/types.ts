/**
 * Shared contract types for the S12-02a member-posting slice.
 */

/** A space this member may see, before the member-posting filter is applied. */
export interface MemberSpace {
	id: string;
	name: string;
	emoji: string | null;
	canCreatePost: boolean;
	isMember: boolean;
	/** Circle `is_private` — members can't be self-joined into private spaces. */
	isPrivate: boolean;
	spaceGroupId: string | null;
	isPostDisabled: boolean;
	/** S12-02b needs the raw Circle space type (e.g. "basic", "chat"). */
	spaceType: string | null;
}

/** A space surfaced to the member as postable — the composer's "post to" list. */
export interface PostableSpace {
	id: string;
	name: string;
	emoji: string | null;
	isHorse: boolean;
}

export interface ListPostableSpacesResult {
	ok: boolean;
	spaces: PostableSpace[];
}

/**
 * Fixed chip kinds plus the per-space chip discriminator (S12-02b). `all` is
 * the unfiltered feed; `horses` collapses every horse space into one chip;
 * `news`/`charity`/`polls` are the fixed story/poll kinds; `space` is one
 * chip per non-horse post-type space the member belongs to.
 */
export type FeedChipKind = "all" | "horses" | "news" | "charity" | "polls" | "space";

/** A filter chip for the Community feed. `spaceIds` is empty for every fixed
 * kind except `horses` (all horse space ids the member is currently in). */
export interface FeedChip {
	id: string;
	kind: FeedChipKind;
	label: string;
	spaceIds: string[];
}

export interface ListFeedChipsResult {
	ok: boolean;
	chips: FeedChip[];
}

export interface CreatePostImageUploadUrlResult {
	signedUploadUrl: string;
	path: string;
}

/** Reasons `community.createPost` can fail — the handler returns before any Circle write. */
export type CreatePostFailure =
	| "not_allowed"
	| "blocked"
	| "rate_limited"
	| "image_failed"
	| "circle_failed";

export type CreatePostResult =
	| { ok: true; post: { circlePostId: string; spaceId: string } }
	| { ok: false; reason: CreatePostFailure };

export interface DeletePostResult {
	ok: boolean;
}

/** Reasons a member can select when reporting a post or comment. */
export type ReportReason = "spam" | "abusive" | "off_topic" | "other";

export interface ReportContentResult {
	ok: boolean;
}
