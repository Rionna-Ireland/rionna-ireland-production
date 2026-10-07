import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { clearMemberFeedCache } from "../../../circle/lib/member-feed-cache";

/**
 * S13-11: present an existing Circle post as a trainer's (or clear it). Used
 * for posts created directly in Circle; the composer's "Post as" picker covers
 * new posts. Comments always keep their real author.
 */
export const attributePost = adminProcedure
	.route({
		method: "POST",
		path: "/admin/community/posts/attribute",
		tags: ["Community"],
		summary: "Attribute a Circle post to a trainer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			circlePostId: z.string().min(1),
			/** null removes the attribution. */
			trainerId: z.string().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (context.session.activeOrganizationId !== input.organizationId) {
			throw new ORPCError("FORBIDDEN");
		}
		if (input.trainerId === null) {
			await db.postAttribution.deleteMany({
				where: { organizationId: input.organizationId, circlePostId: input.circlePostId },
			});
		} else {
			const trainer = await db.trainer.findFirst({
				where: { id: input.trainerId, organizationId: input.organizationId },
				select: { id: true },
			});
			if (!trainer) {
				throw new ORPCError("NOT_FOUND", { message: "Trainer not found" });
			}
			await db.postAttribution.upsert({
				where: { circlePostId: input.circlePostId },
				create: {
					organizationId: input.organizationId,
					circlePostId: input.circlePostId,
					trainerId: trainer.id,
				},
				update: { trainerId: trainer.id },
			});
		}
		// Per-member feed buffers embed the author; drop them so it shows now.
		clearMemberFeedCache();
		return { ok: true as const };
	});
