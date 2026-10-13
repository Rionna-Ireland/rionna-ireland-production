import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

/** S13-13: admin-entered Inside Track video lengths as `circlePostId -> seconds`. */
export const listInsideTrackVideoDurations = adminProcedure
	.route({
		method: "GET",
		path: "/admin/inside-track/video-durations",
		tags: ["MemberPosts"],
		summary: "List admin-entered Inside Track video lengths",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context }) => {
		if (context.session.activeOrganizationId !== input.organizationId) {
			throw new ORPCError("FORBIDDEN");
		}
		const rows = await db.insideTrackMeta.findMany({
			where: { organizationId: input.organizationId },
			select: { circlePostId: true, videoDurationSeconds: true },
		});
		const out: Record<string, number> = {};
		for (const row of rows) {
			if (row.videoDurationSeconds !== null) out[row.circlePostId] = row.videoDurationSeconds;
		}
		return out;
	});
