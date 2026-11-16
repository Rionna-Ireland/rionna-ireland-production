import { ORPCError } from "@orpc/server";
import { createModerationFlag, db } from "@repo/database";
import { logger } from "@repo/logs";
import { checkRateLimit } from "@repo/utils/lib/rate-limit";
import { z } from "zod";

import { runAfterResponse } from "../../../lib/after-response";
import { memberProcedure } from "../../../orpc/procedures";
import { excerptOf } from "../../moderation/excerpt";
import { EXCERPT_CHARS, MAX_NOTE_CHARS, REPORTS_PER_DAY } from "../lib/limits";
import { notifyAdminsOfReport } from "../lib/notify-admins-of-report";
import { fetchReportedContent } from "../lib/reported-content";
import type { ReportContentResult } from "../lib/types";

const inputSchema = z
	.object({
		organizationId: z.string(),
		surface: z.enum(["post", "comment"]),
		postId: z.string().min(1),
		commentId: z.string().min(1).optional(),
		spaceId: z.string().min(1).optional(),
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
 *
 * W-06: the excerpt and author are read from Circle with the reporter's own
 * token, never taken from the client; an id that does not resolve is refused.
 */
export const reportContent = memberProcedure
	.route({
		method: "POST",
		path: "/community/report",
		tags: ["Community"],
		summary: "Report a post or comment",
	})
	.input(inputSchema)
	.handler(async ({ input, context: { user } }): Promise<ReportContentResult> => {
		const { organizationId, surface, postId, commentId, spaceId, reason, note } = input;

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId },
			select: { id: true, circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return { ok: false };
		}

		// Fails open when Upstash is unavailable (see checkRateLimit).
		const limit = await checkRateLimit({
			prefix: "rl:community:report",
			key: member.id,
			limit: REPORTS_PER_DAY,
			windowSeconds: 24 * 60 * 60,
		});
		if (!limit.ok) {
			throw new ORPCError("TOO_MANY_REQUESTS");
		}

		const org = await db.organization.findUnique({
			where: { id: organizationId },
			select: { slug: true },
		});
		if (!org?.slug) {
			return { ok: false };
		}

		const target = await fetchReportedContent({
			orgSlug: org.slug,
			circleMemberId: member.circleMemberId,
			postId,
			commentId: surface === "comment" ? (commentId ?? null) : null,
			spaceId: spaceId ?? null,
		});
		if (target.status === "not_found") {
			throw new ORPCError("NOT_FOUND", { message: "Reported content not found" });
		}
		if (target.status === "error") {
			return { ok: false };
		}

		const contentExcerpt = excerptOf(target.text, EXCERPT_CHARS);

		const flag = await createModerationFlag({
			organizationId,
			source: "reported",
			surface,
			memberId: member.id,
			targetPostId: postId,
			targetCommentId: commentId ?? null,
			targetSpaceId: spaceId ?? null,
			targetAuthorName: target.authorName,
			contentExcerpt,
			reason,
			note: note ?? null,
		});

		// Duplicate report (partial unique index) — quietly succeed, no email.
		if (!flag) {
			return { ok: true };
		}

		runAfterResponse(notifyAdminsOfReport({ organizationId, reason, excerpt: contentExcerpt }));

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
