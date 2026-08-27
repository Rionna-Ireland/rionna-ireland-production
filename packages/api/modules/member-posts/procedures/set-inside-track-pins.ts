import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

/**
 * Overwrite the Inside Track "Start Here" pin list (ordered Circle post ids).
 * One procedure covers pin, unpin and reorder — the client always sends the
 * full new list. Last-write-wins on metadata is acceptable single-club.
 */
export const setInsideTrackPins = adminProcedure
	.route({
		method: "POST",
		path: "/admin/inside-track/pins",
		tags: ["MemberPosts"],
		summary: "Set the ordered Inside Track pin list",
	})
	.input(
		z.object({
			organizationId: z.string(),
			pinnedPostIds: z
				.array(z.string().min(1))
				.max(20)
				.refine((ids) => new Set(ids).size === ids.length, {
					message: "Pinned post ids must be distinct.",
				}),
		}),
	)
	.handler(async ({ input, context }) => {
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org) {
			throw new ORPCError("NOT_FOUND");
		}
		const metadata = parseOrgMetadata(org.metadata as string | null);
		await db.organization.update({
			where: { id: input.organizationId },
			data: {
				metadata: JSON.stringify({
					...metadata,
					circle: {
						...metadata.circle,
						insideTrack: {
							...metadata.circle?.insideTrack,
							pinnedPostIds: input.pinnedPostIds,
						},
					},
				}),
			},
		});
		logger.info("Inside Track pins updated", {
			event: "inside_track.pins_updated",
			organizationId: input.organizationId,
			userId: context.user.id,
			count: input.pinnedPostIds.length,
		});
		return { pinnedPostIds: input.pinnedPostIds };
	});
