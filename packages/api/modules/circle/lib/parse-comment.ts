import { extractPostText, objectValue, textValue } from "./parse-post";

export interface PostComment {
	id: string;
	parentCommentId: string | null;
	bodyText: string | null;
	/** Circle TipTap document (`tiptap_body.body`) when the comment was rich-authored. */
	tiptapDoc: Record<string, unknown> | null;
	authorName: string | null;
	authorAvatarUrl: string | null;
	/**
	 * Circle community-member id of the REAL author. For trainer-attributed posts
	 * this stays the admin who actually posted (used server-side for `isOwn` and
	 * `authorRole`); `authorName`/`authorAvatarUrl` show the trainer. Clients must
	 * not display or key identity off this field.
	 */
	authorCircleMemberId: string | null;
	/** S13-11: club role badge. Filled by the procedure's batched lookup. */
	authorRole?: "trainer" | "staff" | null;
	createdAt: string | null;
	likeCount: number;
	/** Whether the authenticated member has liked this comment (`is_liked`). */
	isLiked: boolean;
	/** Circle's `policies.can_destroy` — gates the delete affordance in the UI. */
	canDelete: boolean;
	/** One level of nested replies, as Circle returns them. */
	replies: PostComment[];
}

function idValue(value: unknown): string | null {
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return textValue(value);
}

export function toPostComment(record: Record<string, unknown>): PostComment | null {
	const id = idValue(record.id);
	if (!id) return null;

	const author =
		objectValue(record.author) ??
		objectValue(record.user) ??
		objectValue(record.community_member);
	const policies = objectValue(record.policies);
	const tiptap = objectValue(record.tiptap_body);
	const likeCount = record.user_likes_count;
	const replies = Array.isArray(record.replies) ? record.replies : [];

	return {
		id,
		parentCommentId: idValue(record.parent_comment_id),
		bodyText: extractPostText(record),
		tiptapDoc: objectValue(tiptap?.body),
		authorName: textValue(author?.name) ?? textValue(author?.display_name),
		authorAvatarUrl: textValue(author?.avatar_url) ?? textValue(author?.avatar),
		authorCircleMemberId:
			author?.community_member_id === undefined || author.community_member_id === null
				? null
				: String(author.community_member_id),
		createdAt: textValue(record.created_at),
		likeCount: typeof likeCount === "number" && Number.isFinite(likeCount) ? likeCount : 0,
		isLiked: record.is_liked === true,
		canDelete: policies?.can_destroy === true,
		replies: replies
			.map((reply) => {
				const replyRecord = objectValue(reply);
				return replyRecord ? toPostComment(replyRecord) : null;
			})
			.filter((reply): reply is PostComment => reply !== null),
	};
}

/** Reads the paginated `{records}` envelope — or a bare array, Circle does both. */
export function extractComments(payload: unknown): PostComment[] {
	const raw = Array.isArray(payload) ? payload : (objectValue(payload)?.records ?? []);
	if (!Array.isArray(raw)) return [];
	return raw
		.map((record) => {
			const comment = objectValue(record);
			return comment ? toPostComment(comment) : null;
		})
		.filter((comment): comment is PostComment => comment !== null);
}
