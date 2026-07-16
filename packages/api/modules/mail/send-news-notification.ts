/**
 * News notification email sender
 *
 * Sends a news notification email to all eligible members when
 * an admin publishes a news post with "notify members" enabled.
 *
 * Uses opt-out model: members receive emails unless they have
 * explicitly set emailPreferences.newsPost = false.
 *
 * FABLE_AUDIT P1: the fan-out uses the provider's batch API (chunks of
 * MAX_BATCH_SIZE) instead of one serial sendEmail per member — a serial
 * loop exceeds the Vercel function limit at real membership counts and
 * silently drops the remainder. The template renders once (D23: the
 * product is English-only) and every member receives identical content.
 * A failed chunk is counted rather than thrown; the caller decides
 * whether to release the one-shot notification claim.
 *
 * @see Architecture/specs/S2-05-transactional-email.md
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { MAX_BATCH_SIZE, getTemplate, sendRawEmailBatch } from "@repo/mail";
import { getBaseUrl } from "@repo/utils";

export interface NewsNotificationResult {
	total: number;
	sent: number;
	failed: number;
}

export async function sendNewsNotificationEmails(post: {
	id: string;
	organizationId: string;
	title: string;
	subtitle: string | null;
	featuredImageUrl: string | null;
	slug: string;
}): Promise<NewsNotificationResult> {
	const none: NewsNotificationResult = { total: 0, sent: 0, failed: 0 };

	const org = await db.organization.findUnique({
		where: { id: post.organizationId },
	});

	if (!org) {
		return none;
	}

	const members = await db.member.findMany({
		where: { organizationId: post.organizationId },
		include: {
			user: {
				select: {
					email: true,
					emailPreferences: true,
					locale: true,
				},
			},
		},
	});

	const eligibleMembers = members.filter((m) => {
		const prefs = (m.user.emailPreferences as Record<string, boolean>) ?? {};
		return prefs.newsPost !== false; // Default true (opt-out model)
	});

	if (eligibleMembers.length === 0) {
		return none;
	}

	const baseUrl = getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000);
	const postUrl = `${baseUrl}/news/${post.slug}`;

	const template = await getTemplate({
		templateId: "newsNotification",
		context: {
			title: post.title,
			subtitle: post.subtitle,
			featuredImageUrl: post.featuredImageUrl,
			postUrl,
			clubName: org.name,
		},
		locale: "en",
	});

	let sent = 0;
	let failed = 0;
	for (let start = 0; start < eligibleMembers.length; start += MAX_BATCH_SIZE) {
		const chunk = eligibleMembers.slice(start, start + MAX_BATCH_SIZE);
		try {
			await sendRawEmailBatch(
				chunk.map((member) => ({
					to: member.user.email,
					subject: template.subject,
					html: template.html,
					text: template.text,
				})),
			);
			sent += chunk.length;
		} catch (error) {
			failed += chunk.length;
			logger.error("News notification batch failed", {
				newsPostId: post.id,
				chunkStart: start,
				chunkSize: chunk.length,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	logger.info("News notification emails dispatched", {
		newsPostId: post.id,
		total: eligibleMembers.length,
		sent,
		failed,
	});

	return { total: eligibleMembers.length, sent, failed };
}
