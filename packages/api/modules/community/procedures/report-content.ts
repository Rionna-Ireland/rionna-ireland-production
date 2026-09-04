import { createModerationFlag, db } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { excerptOf } from "../../moderation/excerpt";
import { EXCERPT_CHARS, MAX_NOTE_CHARS } from "../lib/limits";
import { notifyAdminsOfReport } from "../lib/notify-admins-of-report";
import type { ReportContentResult } from "../lib/types";

const inputSchema = z
	.object({
		organizationId: z.string(),
		surface: z.enum(["post", "comment"]),
		postId: z.string().min(1),
		commentId: z.string().min(1).optional(),
		spaceId: z.string().min(1).optional(),
		excerpt: z.string().trim().max(500),
		authorName: z.string().trim().max(120).optional(),
		reason: z.enum(["spam", "abusive", "off_topic", "other"]),
		note: z.string().trim().max(MAX_NOTE_CHARS).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.surface === "comment" && !value.commentId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "commentId is required when reporting a comment",
				path: ["commentId"],
			});
		}
	});

/**
 * Members report posts/comments into OUR moderation queue (never Circle's).
 * The kill-switch (`features.communityPosting`) does NOT gate this — reports
 * must always work even when posting is disabled. A duplicate report (the
 * partial unique index on member+post/comment) is a quiet `{ ok: true }` with
 * no admin email; every other successful report fans out one email per
 * club admin/owner (fire-and-forget, never blocks the response).
 */
export const reportContent = protectedProcedure
	.route({
		method: "POST",
		path: "/community/report",
		tags: ["Community"],
		summary: "Report a post or comment",
	})
	.input(inputSchema)
	.handler(async ({ input, context: { user } }): Promise<ReportContentResult> => {
		const { organizationId, surface, postId, commentId, spaceId, excerpt, authorName, reason, note } =
			input;

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId },
			select: { id: true },
		});
		if (!member) {
			return { ok: false };
		}

		const contentExcerpt = excerptOf(excerpt, EXCERPT_CHARS);

		const flag = await createModerationFlag({
			organizationId,
			source: "reported",
			surface,
			memberId: member.id,
			targetPostId: postId,
			targetCommentId: commentId ?? null,
			targetSpaceId: spaceId ?? null,
			targetAuthorName: authorName ?? null,
			contentExcerpt,
			reason,
			note: note ?? null,
		});

		// Duplicate report (partial unique index) — quietly succeed, no email.
		if (!flag) {
			return { ok: true };
		}

		void notifyAdminsOfReport({ organizationId, reason, excerpt: contentExcerpt });

		logger.info("moderation.reported", {
			organizationId,
			memberId: member.id,
			surface,
			reason,
			targetPostId: postId,
			targetCommentId: commentId ?? null,
		});

		return { ok: true };
	});
