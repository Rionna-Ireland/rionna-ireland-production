import { ORPCError } from "@orpc/server";
import { getNewsPostById, updateNewsPost as updateNewsPostDb } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { notifyNewsMembers } from "../lib/notify-news-members";
import { sanitizeNewsHtml } from "../lib/sanitize-news-html";

export const updateNewsPost = adminProcedure
	.route({
		method: "POST",
		path: "/admin/news/update",
		tags: ["News"],
		summary: "Update a news post",
	})
	.input(
		z.object({
			newsPostId: z.string(),
			title: z.string().min(1).optional(),
			subtitle: z.string().nullable().optional(),
			slug: z.string().optional(),
			featuredImageUrl: z.string().nullable().optional(),
			category: z.enum(["charity"]).nullable().optional(),
			contentJson: z.unknown().optional(),
			contentHtml: z.string().optional(),
			publish: z.boolean().optional(),
			notifyMembersOnPublish: z.boolean().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const existingPost = await getNewsPostById(input.newsPostId);

		if (!existingPost) {
			throw new ORPCError("NOT_FOUND");
		}

		const updateData: Parameters<typeof updateNewsPostDb>[1] = {};

		if (input.title !== undefined) {
			updateData.title = input.title;
		}
		if (input.subtitle !== undefined) {
			updateData.subtitle = input.subtitle;
		}
		if (input.slug !== undefined) {
			updateData.slug = input.slug;
		}
		if (input.featuredImageUrl !== undefined) {
			updateData.featuredImageUrl = input.featuredImageUrl;
		}
		if (input.category !== undefined) {
			updateData.category = input.category;
		}
		if (input.contentJson !== undefined) {
			updateData.contentJson = input.contentJson as object;
		}
		if (input.contentHtml !== undefined) {
			updateData.contentHtml = sanitizeNewsHtml(input.contentHtml);
		}
		if (input.notifyMembersOnPublish !== undefined) {
			updateData.notifyMembersOnPublish = input.notifyMembersOnPublish;
		}

		if (input.publish) {
			updateData.publishedAt = existingPost.publishedAt ?? new Date();
		}

		const post = await updateNewsPostDb(input.newsPostId, updateData);

		if (input.publish && input.notifyMembersOnPublish) {
			await notifyNewsMembers({
				id: post.id,
				organizationId: post.organizationId,
				title: post.title,
				subtitle: post.subtitle,
				featuredImageUrl: post.featuredImageUrl,
				slug: post.slug,
			});
		}

		logger.info("Admin updated news post", {
			event: "admin_news_post_updated",
			actorUserId: context.user.id,
			organizationId: post.organizationId,
			newsPostId: post.id,
		});

		return post;
	});
