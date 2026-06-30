import { ORPCError } from "@orpc/server";
import { deleteNewsPost as deleteNewsPostDb, getNewsPostById } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

export const deleteNewsPost = adminProcedure
	.route({
		method: "POST",
		path: "/admin/news/delete",
		tags: ["News"],
		summary: "Delete a news post",
	})
	.input(
		z.object({
			newsPostId: z.string(),
		}),
	)
	.handler(async ({ input: { newsPostId }, context }) => {
		const post = await getNewsPostById(newsPostId);

		if (!post) {
			throw new ORPCError("NOT_FOUND");
		}

		await deleteNewsPostDb(newsPostId);

		logger.info("Admin deleted news post", {
			event: "admin_news_post_deleted",
			actorUserId: context.user.id,
			organizationId: post.organizationId,
			newsPostId,
		});

		return { success: true };
	});
