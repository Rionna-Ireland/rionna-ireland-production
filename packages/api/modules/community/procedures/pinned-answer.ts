import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { enrichComments } from "../../circle/lib/author-identity";
import { canPinAnswers, fetchPostComment } from "../../circle/lib/pinned-answer";
import { onAnswerPinned } from "../../inbox/activity-hooks";

const postInput = { organizationId: z.string(), postId: z.string().min(1) };

async function requirePinner(organizationId: string, userId: string) {
	const member = await db.member.findFirst({
		where: { userId, organizationId },
		select: { circleMemberId: true, organization: { select: { slug: true } } },
	});
	if (!member || !(await canPinAnswers(organizationId, userId))) {
		throw new ORPCError("FORBIDDEN", { message: "Only experts, trainers and staff can pin answers" });
	}
	return member;
}

/**
 * S13-19: pin a comment as the thread's expert answer (replaces any current
 * pin). Role-gated; the comment must belong to the post, verified through
 * Circle's post-scoped comment route, never the client's say-so.
 */
export const pinAnswer = protectedProcedure
	.route({
		method: "POST",
		path: "/community/posts/{postId}/pinned-answer",
		tags: ["Community"],
		summary: "Pin a comment as the expert answer",
	})
	.input(z.object({ ...postInput, commentId: z.string().min(1) }))
	.handler(async ({ input, context: { user } }) => {
		const { organizationId, postId, commentId } = input;
		const member = await requirePinner(organizationId, user.id);
		if (!member.circleMemberId || !member.organization.slug) {
			throw new ORPCError("BAD_REQUEST", { message: "No community profile to verify the comment" });
		}
		const fetched = await fetchPostComment({
			orgSlug: member.organization.slug,
			circleMemberId: member.circleMemberId,
			postId,
			commentId,
		});
		if (fetched.status === "not_found") {
			throw new ORPCError("BAD_REQUEST", { message: "Comment does not belong to this post" });
		}
		if (fetched.status === "error") {
			throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not verify the comment" });
		}

		const previous = await db.pinnedAnswer.findUnique({ where: { circlePostId: postId } });
		if (previous && previous.organizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}
		await db.pinnedAnswer.upsert({
			where: { circlePostId: postId },
			create: { organizationId, circlePostId: postId, circleCommentId: commentId, pinnedByUserId: user.id },
			update: { circleCommentId: commentId, pinnedByUserId: user.id, pinnedAt: new Date() },
		});
		logger.info("Pinned expert answer set", {
			event: "admin_pinned_answer_set",
			actorUserId: user.id,
			organizationId,
			circlePostId: postId,
			circleCommentId: commentId,
			previousCommentId: previous?.circleCommentId ?? null,
		});

		if (previous?.circleCommentId !== commentId) {
			// Name the answer's author (trainer-attributed answers show the trainer).
			await enrichComments(organizationId, [fetched.comment]);
			void onAnswerPinned({
				organizationId,
				circlePostId: postId,
				pinner: { userId: user.id },
				answererName: fetched.comment.authorName,
				answerBody: fetched.comment.bodyText ?? "",
			});
		}
		return { ok: true as const };
	});

export const unpinAnswer = protectedProcedure
	.route({
		method: "DELETE",
		path: "/community/posts/{postId}/pinned-answer",
		tags: ["Community"],
		summary: "Clear the pinned expert answer",
	})
	.input(z.object(postInput))
	.handler(async ({ input, context: { user } }) => {
		const { organizationId, postId } = input;
		await requirePinner(organizationId, user.id);
		const { count } = await db.pinnedAnswer.deleteMany({
			where: { organizationId, circlePostId: postId },
		});
		logger.info("Pinned expert answer cleared", {
			event: "admin_pinned_answer_cleared",
			actorUserId: user.id,
			organizationId,
			circlePostId: postId,
			cleared: count,
		});
		return { ok: true as const };
	});
