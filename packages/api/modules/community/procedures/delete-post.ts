import { db, findOwnCommunityPost, markCommunityPostDeleted, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { invalidateMemberFeedCache } from "../../circle/lib/member-feed-cache";
import type { DeletePostResult } from "../lib/types";

/**
 * Delete the member's own post. Ownership is checked against our own
 * `CommunityPost` row (not Circle's) before any Circle call is made — see
 * `delete-post-comment.ts` for the fetch/err handling shape this mirrors.
 */
export const deletePost = protectedProcedure
	.route({
		method: "POST",
		path: "/community/posts/delete",
		tags: ["Community"],
		summary: "Delete a member's own post",
	})
	.input(
		z.object({
			organizationId: z.string(),
			spaceId: z.string().min(1),
			postId: z.string().min(1),
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<DeletePostResult> => {
		const { organizationId, spaceId, postId } = input;

		const org = await db.organization.findUnique({ where: { id: organizationId } });
		const metadata = parseOrgMetadata(org?.metadata ?? null);
		if (!org?.slug || metadata.features?.communityPosting === false) {
			return { ok: false };
		}

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId },
			select: { id: true, circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return { ok: false };
		}

		const ownPost = await findOwnCommunityPost({
			organizationId,
			memberId: member.id,
			circlePostId: postId,
		});
		if (!ownPost) {
			return { ok: false };
		}

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			logger.warn("[Community] Delete post: token mint failed", {
				surface: "community.delete_post",
				userId: user.id,
				organizationId,
				reason: tokenOutcome.reason,
			});
			return { ok: false };
		}

		const base = getCircleHeadlessApiBaseUrl();
		let res: Response;
		try {
			res = await fetch(
				`${base}/spaces/${encodeURIComponent(spaceId)}/posts/${encodeURIComponent(postId)}`,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` },
				},
			);
		} catch (error) {
			logger.warn("[Community] Delete post: request threw", {
				surface: "community.delete_post",
				userId: user.id,
				spaceId,
				postId,
				error: String(error),
			});
			return { ok: false };
		}

		if (!res.ok) {
			logger.warn("[Community] Delete post: rejected", {
				surface: "community.delete_post",
				userId: user.id,
				spaceId,
				postId,
				status: res.status,
			});
			return { ok: false };
		}

		await markCommunityPostDeleted({ circlePostId: postId, deletedBy: "member" });
		invalidateMemberFeedCache(user.id, organizationId);

		logger.info("community.post.deleted", {
			organizationId,
			memberId: member.id,
			spaceId,
			circlePostId: postId,
		});

		return { ok: true };
	});
