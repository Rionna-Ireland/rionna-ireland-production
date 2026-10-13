import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

/** S13-19 admin thread tools: answer a thread as a trainer, see/clear the pinned answer. */

function assertOrg(context: { session: { activeOrganizationId?: string | null } }, orgId: string) {
	if (context.session.activeOrganizationId !== orgId) throw new ORPCError("FORBIDDEN");
}

export const replyAsTrainer = adminProcedure
	.route({
		method: "POST",
		path: "/admin/community/posts/reply",
		tags: ["Community"],
		summary: "Comment on a post, optionally shown as a trainer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			circlePostId: z.string().min(1),
			body: z.string().trim().min(1).max(5000),
			/** null = reply as the admin themself. */
			trainerId: z.string().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrg(context, input.organizationId);
		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
			select: { slug: true },
		});
		const member = await db.member.findFirst({
			where: { organizationId: input.organizationId, userId: context.user.id },
			select: { circleMemberId: true },
		});
		if (!org?.slug || !member?.circleMemberId) {
			throw new ORPCError("BAD_REQUEST", { message: "No community profile for this admin" });
		}
		if (input.trainerId) {
			const trainer = await db.trainer.findFirst({
				where: { id: input.trainerId, organizationId: input.organizationId },
				select: { id: true },
			});
			if (!trainer) throw new ORPCError("NOT_FOUND", { message: "Trainer not found" });
		}
		const created = await createCircleService(org.slug).createComment({
			circlePostId: input.circlePostId,
			circleMemberId: member.circleMemberId,
			body: input.body,
		});
		if (!created.ok) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not post the comment" });
		}
		if (input.trainerId) {
			await db.commentAttribution.create({
				data: {
					organizationId: input.organizationId,
					circleCommentId: created.data.circleCommentId,
					trainerId: input.trainerId,
				},
			});
		}
		logger.info("Admin replied to Circle post", {
			event: "admin_comment_posted",
			actorUserId: context.user.id,
			organizationId: input.organizationId,
			circlePostId: input.circlePostId,
			circleCommentId: created.data.circleCommentId,
			trainerId: input.trainerId,
		});
		return { ok: true as const, circleCommentId: created.data.circleCommentId };
	});

export const getPinnedAnswerAdmin = adminProcedure
	.route({
		method: "GET",
		path: "/admin/community/posts/pinned-answer",
		tags: ["Community"],
		summary: "Current pinned expert answer of a post",
	})
	.input(z.object({ organizationId: z.string(), circlePostId: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		assertOrg(context, input.organizationId);
		const pin = await db.pinnedAnswer.findFirst({
			where: { organizationId: input.organizationId, circlePostId: input.circlePostId },
		});
		if (!pin) return { pinned: null };
		const pinner = await db.user.findUnique({
			where: { id: pin.pinnedByUserId },
			select: { name: true },
		});
		return {
			pinned: {
				circleCommentId: pin.circleCommentId,
				pinnedAt: pin.pinnedAt.toISOString(),
				pinnedByName: pinner?.name ?? null,
			},
		};
	});

export const clearPinnedAnswerAdmin = adminProcedure
	.route({
		method: "POST",
		path: "/admin/community/posts/pinned-answer/clear",
		tags: ["Community"],
		summary: "Unpin a post's expert answer",
	})
	.input(z.object({ organizationId: z.string(), circlePostId: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		assertOrg(context, input.organizationId);
		const { count } = await db.pinnedAnswer.deleteMany({
			where: { organizationId: input.organizationId, circlePostId: input.circlePostId },
		});
		logger.info("Admin cleared pinned answer", {
			event: "admin_pinned_answer_cleared",
			actorUserId: context.user.id,
			organizationId: input.organizationId,
			circlePostId: input.circlePostId,
			cleared: count,
		});
		return { ok: true as const };
	});
