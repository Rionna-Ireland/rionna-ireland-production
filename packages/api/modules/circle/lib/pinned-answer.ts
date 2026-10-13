import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { STAFF_MEMBER_ROLES, STAFF_USER_ROLES } from "@repo/payments/lib/founding-member";

import { type PostComment, toPostComment } from "./parse-comment";
import { objectValue } from "./parse-post";

/**
 * S13-19: who may pin an expert answer — staff (org owner/admin or a global
 * admin/platformAdmin user), a linked trainer, or an expert (`expertLabel`).
 * Fails closed: a lookup error means "can't pin".
 */
export async function canPinAnswers(organizationId: string, userId: string): Promise<boolean> {
	try {
		const member = await db.member.findFirst({
			where: { organizationId, userId },
			select: { role: true, user: { select: { role: true, expertLabel: true } } },
		});
		if (!member) return false;
		if (
			STAFF_MEMBER_ROLES.includes(member.role) ||
			(member.user?.role != null && STAFF_USER_ROLES.includes(member.user.role)) ||
			Boolean(member.user?.expertLabel?.trim())
		) {
			return true;
		}
		const trainer = await db.trainer.findFirst({
			where: { organizationId, userId },
			select: { id: true },
		});
		return trainer !== null;
	} catch (error) {
		logger.warn("[Circle] pin permission lookup failed", { organizationId, error: String(error) });
		return false;
	}
}

/**
 * Remove the pinned comment from a comment list (top-level, or nested as a
 * reply) so it is never shown twice. Replies *to* the pinned comment stay on it.
 */
export function splitPinnedComment(
	comments: PostComment[],
	pinnedCommentId: string,
): { comments: PostComment[]; pinned: PostComment | null } {
	const top = comments.find((c) => c.id === pinnedCommentId);
	if (top) return { comments: comments.filter((c) => c.id !== pinnedCommentId), pinned: top };
	let pinned: PostComment | null = null;
	const rest = comments.map((c) => {
		const reply = c.replies.find((r) => r.id === pinnedCommentId);
		if (!reply) return c;
		pinned = reply;
		return { ...c, replies: c.replies.filter((r) => r.id !== pinnedCommentId) };
	});
	return { comments: rest, pinned };
}

export type FetchedComment =
	| { status: "ok"; comment: PostComment }
	| { status: "not_found" }
	| { status: "error" };

/**
 * Fetch one comment of a post as the given member. Circle scopes the route to
 * the post (`/posts/{post}/comments/{id}`), so "ok" proves the comment belongs
 * to that post; only a 404 means it is gone. Never throws.
 */
export async function fetchPostComment(p: {
	orgSlug: string;
	circleMemberId: string;
	postId: string;
	commentId: string;
}): Promise<FetchedComment> {
	try {
		const token = await createCircleService(p.orgSlug).getMemberToken(p.circleMemberId);
		if (!token.ok) return { status: "error" };
		const res = await fetch(
			`${getCircleHeadlessApiBaseUrl()}/posts/${encodeURIComponent(p.postId)}/comments/${encodeURIComponent(p.commentId)}`,
			{ headers: { Authorization: `Bearer ${token.data.accessToken}` } },
		);
		if (res.status === 404) return { status: "not_found" };
		if (!res.ok) return { status: "error" };
		const envelope = objectValue(await res.json());
		const record = objectValue(envelope?.comment) ?? objectValue(envelope?.record) ?? envelope;
		const comment = record ? toPostComment(record) : null;
		return comment ? { status: "ok", comment } : { status: "error" };
	} catch (error) {
		logger.warn("[Circle] single comment fetch failed", {
			postId: p.postId,
			commentId: p.commentId,
			error: String(error),
		});
		return { status: "error" };
	}
}
