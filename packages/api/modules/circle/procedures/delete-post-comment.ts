import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { invalidateMemberFeedCache } from "../lib/member-feed-cache";

export interface DeletePostCommentResult {
	ok: boolean;
}

/**
 * Delete the member's own comment. Circle enforces ownership server-side
 * (`policies.can_destroy`); the UI only shows the affordance on own comments.
 */
export const deletePostComment = protectedProcedure
	.route({
		method: "POST",
		path: "/circle/post-comment-delete",
		tags: ["Circle"],
		summary: "Delete the authenticated member's comment",
	})
	.input(
		z.object({
			organizationId: z.string(),
			postId: z.string().min(1),
			commentId: z.string().min(1),
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<DeletePostCommentResult> => {
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return { ok: false };
		}

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			logger.warn("[Circle] Delete comment: token mint failed", {
				surface: "circle.delete_post_comment",
				userId: user.id,
				organizationId: input.organizationId,
				reason: tokenOutcome.reason,
			});
			return { ok: false };
		}

		const base = getCircleHeadlessApiBaseUrl();
		let res: Response;
		try {
			res = await fetch(
				`${base}/posts/${encodeURIComponent(input.postId)}/comments/${encodeURIComponent(input.commentId)}`,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` },
				},
			);
		} catch (error) {
			logger.warn("[Circle] Delete comment: request threw", {
				surface: "circle.delete_post_comment",
				userId: user.id,
				postId: input.postId,
				commentId: input.commentId,
				error: String(error),
			});
			return { ok: false };
		}

		if (!res.ok) {
			logger.warn("[Circle] Delete comment: rejected", {
				surface: "circle.delete_post_comment",
				userId: user.id,
				postId: input.postId,
				commentId: input.commentId,
				status: res.status,
			});
			return { ok: false };
		}

		invalidateMemberFeedCache(user.id, input.organizationId);
		return { ok: true };
	});
