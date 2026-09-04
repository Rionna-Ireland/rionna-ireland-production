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

export interface CreatePostImageUploadUrlResult {
	signedUploadUrl: string;
	path: string;
}
