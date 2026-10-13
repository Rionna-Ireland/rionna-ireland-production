import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { enrichComments } from "../lib/author-identity";
import { extractComments, type PostComment } from "../lib/parse-comment";
import { objectValue } from "../lib/parse-post";
import { canPinAnswers, fetchPostComment, splitPinnedComment } from "../lib/pinned-answer";

export interface GetPostCommentsResult {
	ok: boolean;
	comments: PostComment[];
	hasNextPage: boolean;
	totalCount: number | null;
	/** S13-19: the thread's pinned expert answer (removed from `comments`), or null. */
	pinnedAnswer: PostComment | null;
	/** S13-19: whether the viewer may pin/unpin answers. */
	canPin: boolean;
}

/**
 * Read a post's comments as the authenticated member (oldest-first, one Circle
 * page of 60 covers v1 volumes). Fail-safe: any Circle/network problem returns
 * `ok:false` with an empty list rather than throwing.
 */
export const getPostComments = protectedProcedure
	.route({
		method: "GET",
		path: "/circle/post-comments",
		tags: ["Circle"],
		summary: "List a post's comments for the authenticated member",
	})
	.input(
		z.object({
			organizationId: z.string(),
			postId: z.string().min(1),
			page: z.number().int().min(1).default(1),
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<GetPostCommentsResult> => {
		const fail = (): GetPostCommentsResult => ({
			ok: false,
			comments: [],
			hasNextPage: false,
			totalCount: null,
			pinnedAnswer: null,
			canPin: false,
		});

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
			logger.warn("[Circle] Post comments: token mint failed", {
				surface: "circle.post_comments",
				userId: user.id,
				organizationId: input.organizationId,
				reason: tokenOutcome.reason,
			});
			return fail();
		}

		const base = getCircleHeadlessApiBaseUrl();
		let res: Response;
		try {
			res = await fetch(
				`${base}/posts/${encodeURIComponent(input.postId)}/comments?page=${input.page}&per_page=60&sort=oldest`,
				{ headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` } },
			);
		} catch (error) {
			logger.warn("[Circle] Post comments: request threw", {
				surface: "circle.post_comments",
				userId: user.id,
				postId: input.postId,
				error: String(error),
			});
			return fail();
		}

		if (!res.ok) {
			logger.warn("[Circle] Post comments: request failed", {
				surface: "circle.post_comments",
				userId: user.id,
				postId: input.postId,
				status: res.status,
			});
			return fail();
		}

		let payload: unknown;
		try {
			payload = await res.json();
		} catch {
			return fail();
		}
		const envelope = objectValue(payload);
		const count = envelope?.count;
		let comments = extractComments(payload);

		// S13-19: split the pinned answer out of the list. Fail open on any
		// lookup problem — a missing pin must never break the thread.
		let pinnedAnswer: PostComment | null = null;
		try {
			const pin = await db.pinnedAnswer.findUnique({ where: { circlePostId: input.postId } });
			if (pin && pin.organizationId === input.organizationId) {
				const split = splitPinnedComment(comments, pin.circleCommentId);
				comments = split.comments;
				pinnedAnswer = split.pinned;
				// Not on this page: fetch it directly (page 1 carries the card).
				if (!pinnedAnswer && input.page === 1) {
					const fetched = await fetchPostComment({
						orgSlug: org.slug,
						circleMemberId: member.circleMemberId,
						postId: input.postId,
						commentId: pin.circleCommentId,
					});
					if (fetched.status === "ok") {
						pinnedAnswer = fetched.comment;
					} else if (fetched.status === "not_found") {
						// Deleted in Circle: drop the stale pin lazily.
						await db.pinnedAnswer.deleteMany({ where: { id: pin.id } });
					}
				}
			}
		} catch (error) {
			logger.warn("[Circle] Post comments: pinned answer lookup failed", {
				surface: "circle.post_comments",
				postId: input.postId,
				error: String(error),
			});
		}

		// S13-11/S13-19: one batched role + attribution lookup across everything shown.
		await enrichComments(input.organizationId, pinnedAnswer ? [...comments, pinnedAnswer] : comments);
		const canPin = await canPinAnswers(input.organizationId, user.id);
		return {
			ok: true,
			comments,
			hasNextPage: envelope?.has_next_page === true,
			totalCount: typeof count === "number" && Number.isFinite(count) ? count : null,
			pinnedAnswer,
			canPin,
		};
	});
