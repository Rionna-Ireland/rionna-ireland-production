import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { invalidateMemberFeedCache } from "../lib/member-feed-cache";

export interface SetPostLikeResult {
	ok: boolean;
	liked: boolean;
	likeCount: number | null;
}

/**
 * Like/unlike a post as the authenticated member — the first Member-API write
 * in the backend-proxied architecture. Fail-safe throughout: any Circle or
 * network problem returns `ok:false` rather than throwing; the client rolls
 * back its optimistic flip.
 */
export const setPostLike = protectedProcedure
	.route({
		method: "POST",
		path: "/circle/post-like",
		tags: ["Circle"],
		summary: "Like or unlike a post as the authenticated member",
	})
	.input(
		z.object({
			organizationId: z.string(),
			postId: z.string().min(1),
			liked: z.boolean(),
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<SetPostLikeResult> => {
		const fail = (): SetPostLikeResult => ({ ok: false, liked: input.liked, likeCount: null });

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
			logger.warn("[Circle] Post like: token mint failed", {
				surface: "circle.post_like",
				userId: user.id,
				organizationId: input.organizationId,
				reason: tokenOutcome.reason,
			});
			return fail();
		}

		const base = getCircleHeadlessApiBaseUrl();
		let res: Response;
		try {
			res = await fetch(`${base}/posts/${encodeURIComponent(input.postId)}/user_likes`, {
				method: input.liked ? "POST" : "DELETE",
				headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` },
			});
		} catch (error) {
			logger.warn("[Circle] Post like: request threw", {
				surface: "circle.post_like",
				userId: user.id,
				postId: input.postId,
				liked: input.liked,
				error: String(error),
			});
			return fail();
		}

		const succeeded = (): SetPostLikeResult => {
			// The 60s merged buffer would otherwise echo the stale count/flag back
			// to this member on the next feed load.
			invalidateMemberFeedCache(user.id, input.organizationId);
			return { ok: true, liked: input.liked, likeCount: null };
		};

		if (res.ok) {
			const result = succeeded();
			try {
				const body = (await res.json()) as Record<string, unknown>;
				const count = body?.user_likes_count;
				if (typeof count === "number" && Number.isFinite(count)) {
					result.likeCount = count;
				}
			} catch {
				// No parseable body — the like still landed; count stays null.
			}
			return result;
		}

		if (res.status === 401 || res.status === 403) {
			logger.warn("[Circle] Post like: auth rejected", {
				surface: "circle.post_like",
				userId: user.id,
				postId: input.postId,
				status: res.status,
			});
			return fail();
		}

		if (res.status >= 400 && res.status < 500) {
			// Liking an already-liked post (or unliking a non-liked one) comes back
			// as a 4xx from Circle — the post is already in the desired state, so
			// report success and let a feed refresh reconcile the count.
			logger.info("[Circle] Post like: already in desired state", {
				surface: "circle.post_like",
				userId: user.id,
				postId: input.postId,
				liked: input.liked,
				status: res.status,
			});
			return succeeded();
		}

		logger.warn("[Circle] Post like: request failed", {
			surface: "circle.post_like",
			userId: user.id,
			postId: input.postId,
			liked: input.liked,
			status: res.status,
		});
		return fail();
	});
