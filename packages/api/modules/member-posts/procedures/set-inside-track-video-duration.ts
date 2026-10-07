import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { invalidateInsideTrackCache } from "../../circle/lib/inside-track-cache";

/** 24h ceiling — a sanity bound against unit mix-ups, not a product rule. */
const MAX_SECONDS = 24 * 60 * 60;

/**
 * S13-13: set (or clear) the admin-entered video length for an Inside Track
 * post. Needed for linked YouTube/Vimeo videos (Circle exposes no duration)
 * and overrides the value parsed from an uploaded video. `null` clears it.
 */
export const setInsideTrackVideoDuration = adminProcedure
	.route({
		method: "POST",
		path: "/admin/inside-track/video-duration",
		tags: ["MemberPosts"],
		summary: "Set the video length for an Inside Track post",
	})
	.input(
		z.object({
			organizationId: z.string(),
			circlePostId: z.string().min(1),
			videoDurationSeconds: z.number().int().min(1).max(MAX_SECONDS).nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (context.session.activeOrganizationId !== input.organizationId) {
			throw new ORPCError("FORBIDDEN");
		}
		if (input.videoDurationSeconds === null) {
			await db.insideTrackMeta.deleteMany({
				where: { organizationId: input.organizationId, circlePostId: input.circlePostId },
			});
		} else {
			await db.insideTrackMeta.upsert({
				where: { circlePostId: input.circlePostId },
				create: {
					organizationId: input.organizationId,
					circlePostId: input.circlePostId,
					videoDurationSeconds: input.videoDurationSeconds,
				},
				update: { videoDurationSeconds: input.videoDurationSeconds },
			});
		}
		invalidateInsideTrackCache(input.organizationId);
		logger.info("Admin set Inside Track video length", {
			event: "admin_inside_track_video_duration_set",
			actorUserId: context.user.id,
			organizationId: input.organizationId,
			circlePostId: input.circlePostId,
			videoDurationSeconds: input.videoDurationSeconds,
			changedFields: ["videoDurationSeconds"],
		});
		return {
			circlePostId: input.circlePostId,
			videoDurationSeconds: input.videoDurationSeconds,
		};
	});
