import { ORPCError } from "@orpc/server";
import {
	claimNewsPostNotification,
	getNewsPostById,
	releaseNewsPostNotification,
	updateNewsPost as updateNewsPostDb,
} from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { sendNewsNotificationEmails } from "../../mail/send-news-notification";
import { sendPush } from "../../racing/ingest/send-push";

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
		if (input.contentJson !== undefined) {
			updateData.contentJson = input.contentJson as object;
		}
		if (input.contentHtml !== undefined) {
			updateData.contentHtml = input.contentHtml;
		}
		if (input.notifyMembersOnPublish !== undefined) {
			updateData.notifyMembersOnPublish = input.notifyMembersOnPublish;
		}

		if (input.publish) {
			updateData.publishedAt = existingPost.publishedAt ?? new Date();
		}

		const post = await updateNewsPostDb(input.newsPostId, updateData);

		// FABLE_AUDIT P1: the one-shot notification is claimed atomically (two
		// concurrent publishes can't both send), and the claim is released when
		// nothing went out so a re-publish can retry. A partial email failure
		// keeps the claim — re-sending to the successes would be worse.
		if (input.publish && input.notifyMembersOnPublish) {
			const claimed = await claimNewsPostNotification(input.newsPostId);
			if (claimed) {
				try {
					await sendPush({
						organizationId: post.organizationId,
						triggerType: "NEWS_POST",
						triggerRefId: post.id,
						title: `New post: ${post.title}`,
						body: post.subtitle ?? post.title,
						data: { screen: "news", newsPostId: post.id },
					});

					// Send email notifications to eligible members (S2-05)
					const emailResult = await sendNewsNotificationEmails({
						id: post.id,
						organizationId: post.organizationId,
						title: post.title,
						subtitle: post.subtitle,
						featuredImageUrl: post.featuredImageUrl,
						slug: post.slug,
					});

					if (emailResult.total > 0 && emailResult.sent === 0) {
						await releaseNewsPostNotification(input.newsPostId);
						logger.error(
							"News notification emails all failed; claim released for retry",
							{
								newsPostId: post.id,
								failed: emailResult.failed,
							},
						);
					}
				} catch (error) {
					await releaseNewsPostNotification(input.newsPostId);
					throw error;
				}
			}
		}

		logger.info("Admin updated news post", {
			event: "admin_news_post_updated",
			actorUserId: context.user.id,
			organizationId: post.organizationId,
			newsPostId: post.id,
		});

		return post;
	});
