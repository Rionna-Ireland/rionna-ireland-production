import {
	claimNewsPostNotification,
	releaseNewsPostNotification,
} from "@repo/database";
import { logger } from "@repo/logs";

import { sendNewsNotificationEmails } from "../../mail/send-news-notification";
import { sendPush } from "../../racing/ingest/send-push";

export interface NotifyNewsMembersInput {
	id: string;
	organizationId: string;
	title: string;
	subtitle: string | null;
	featuredImageUrl: string | null;
	slug: string;
}

/**
 * One-shot NEWS_POST fan-out (push + email) after an admin publishes with
 * notify on. Shared by createNewsPost and updateNewsPost so create+publish
 * doesn't skip Expo (S2-02).
 *
 * FABLE_AUDIT P1: the claim is atomic (two concurrent publishes can't both
 * send), and is released when nothing went out so a re-publish can retry.
 * A partial email failure keeps the claim — re-sending to the successes
 * would be worse.
 *
 * Push `data.newsPostId` is the **slug**: mobile `/news/[news-post-id]`
 * fetches `GET /api/news/{slug}`.
 */
export async function notifyNewsMembers(post: NotifyNewsMembersInput): Promise<void> {
	const claimed = await claimNewsPostNotification(post.id);
	if (!claimed) {
		return;
	}

	try {
		await sendPush({
			organizationId: post.organizationId,
			triggerType: "NEWS_POST",
			triggerRefId: post.id,
			title: `New post: ${post.title}`,
			body: post.subtitle ?? post.title,
			data: { screen: "news", newsPostId: post.slug },
		});

		const emailResult = await sendNewsNotificationEmails({
			id: post.id,
			organizationId: post.organizationId,
			title: post.title,
			subtitle: post.subtitle,
			featuredImageUrl: post.featuredImageUrl,
			slug: post.slug,
		});

		if (emailResult.total > 0 && emailResult.sent === 0) {
			await releaseNewsPostNotification(post.id);
			logger.error("News notification emails all failed; claim released for retry", {
				newsPostId: post.id,
				failed: emailResult.failed,
			});
		}
	} catch (error) {
		await releaseNewsPostNotification(post.id);
		throw error;
	}
}
