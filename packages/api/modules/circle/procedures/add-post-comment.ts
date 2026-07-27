import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { invalidateMemberFeedCache } from "../lib/member-feed-cache";
import { type PostComment, toPostComment } from "../lib/parse-comment";
import { objectValue } from "../lib/parse-post";

export interface AddPostCommentResult {
	ok: boolean;
	comment: PostComment | null;
}

/**
 * Write a comment as the authenticated member. Circle requires the
 * `{comment:{...}}` wrapper (unwrapped → 404 "Missing parameter: comment");
 * tiptap_body is the source-of-truth content, so a minimal single-paragraph
 * doc is sent alongside the plain body. Fail-safe `ok:false` — a 401 here
 * usually means the post has `is_comments_enabled:false` (S7-03 A1 lesson),
 * not a token problem.
 */
export const addPostComment = protectedProcedure
	.route({
		method: "POST",
		path: "/circle/post-comment",
		tags: ["Circle"],
		summary: "Comment on a post as the authenticated member",
	})
	.input(
		z.object({
			organizationId: z.string(),
			postId: z.string().min(1),
			body: z.string().trim().min(1).max(5000),
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<AddPostCommentResult> => {
		const fail = (): AddPostCommentResult => ({ ok: false, comment: null });

		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return fail();
		}

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			logger.warn("[Circle] Add comment: token mint failed", {
				surface: "circle.add_post_comment",
				userId: user.id,
				organizationId: input.organizationId,
				reason: tokenOutcome.reason,
			});
			return fail();
		}

		const base = getCircleHeadlessApiBaseUrl();
		let res: Response;
		try {
			res = await fetch(`${base}/posts/${encodeURIComponent(input.postId)}/comments`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${tokenOutcome.data.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					comment: {
						body: input.body,
						tiptap_body: {
							body: {
								type: "doc",
								content: [
									{
										type: "paragraph",
										content: [{ type: "text", text: input.body }],
									},
								],
							},
						},
					},
				}),
			});
		} catch (error) {
			logger.warn("[Circle] Add comment: request threw", {
				surface: "circle.add_post_comment",
				userId: user.id,
				postId: input.postId,
				error: String(error),
			});
			return fail();
		}

		if (!res.ok) {
			logger.warn("[Circle] Add comment: rejected", {
				surface: "circle.add_post_comment",
				userId: user.id,
				postId: input.postId,
				status: res.status,
			});
			return fail();
		}

		// Comment counts on feed cards come from the 60s merged buffer.
		invalidateMemberFeedCache(user.id, input.organizationId);

		try {
			const payload = objectValue(await res.json());
			return { ok: true, comment: payload ? toPostComment(payload) : null };
		} catch {
			// The comment landed; the client refetches to pick it up.
			return { ok: true, comment: null };
		}
	});
