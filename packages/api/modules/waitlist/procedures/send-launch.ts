import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { MAX_BATCH_SIZE, sendRawEmailBatch } from "@repo/mail";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { buildLaunchEmail, getMarketingUrl, launchContentSchema } from "../lib/launch-email";

/** Only people still on the list who haven't had the launch email yet. */
function pendingWhere(organizationId: string) {
	return { organizationId, status: "subscribed", launchEmailSentAt: null };
}

/**
 * S12-09 Phase 2: send the launch email to the waitlist.
 *
 * Renders WaitlistLaunch per recipient (first-name greeting + their own
 * unsubscribe link and RFC 8058 headers) and sends in chunks of
 * MAX_BATCH_SIZE, following send-news-notification.ts. `launchEmailSentAt` is
 * stamped only for chunks the provider accepted, so a failed chunk stays
 * pending and a re-run resumes where it stopped without double-sending.
 * `maxToSend` spreads a list larger than the Resend daily cap over days.
 *
 * @see Architecture/specs/S12-09-waitlist-landing.md §"Phase 2: launch send"
 */
export const sendWaitlistLaunch = adminProcedure
	.route({
		method: "POST",
		path: "/admin/waitlist/send-launch",
		tags: ["Waitlist"],
		summary: "Send the launch email to pending waitlist subscribers",
	})
	.input(
		launchContentSchema.extend({
			organizationId: z.string(),
			maxToSend: z.number().int().min(1).max(100_000).optional(),
		}),
	)
	.handler(async ({ input: { organizationId, maxToSend, ...content }, context }) => {
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		const recipients = await db.waitlistSignup.findMany({
			where: pendingWhere(organizationId),
			select: { id: true, email: true, firstName: true, unsubscribeToken: true },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			...(maxToSend ? { take: maxToSend } : {}),
		});

		const marketingUrl = getMarketingUrl();
		let sent = 0;
		let failedChunks = 0;

		for (let start = 0; start < recipients.length; start += MAX_BATCH_SIZE) {
			const chunk = recipients.slice(start, start + MAX_BATCH_SIZE);
			try {
				const messages = await Promise.all(
					chunk.map((recipient) =>
						buildLaunchEmail({ recipient, content, marketingUrl }),
					),
				);
				await sendRawEmailBatch(messages);
			} catch (error) {
				// Leave the chunk unstamped so a re-run picks it up again.
				failedChunks += 1;
				logger.error("Waitlist launch batch failed", {
					event: "admin_waitlist_launch_chunk_failed",
					organizationId,
					chunkStart: start,
					chunkSize: chunk.length,
					error: error instanceof Error ? error.message : String(error),
				});
				continue;
			}

			await db.waitlistSignup.updateMany({
				where: {
					id: { in: chunk.map((recipient) => recipient.id) },
					launchEmailSentAt: null,
				},
				data: { launchEmailSentAt: new Date() },
			});
			sent += chunk.length;
		}

		const remaining = await db.waitlistSignup.count({ where: pendingWhere(organizationId) });

		const result = { attempted: recipients.length, sent, failedChunks, remaining };
		logger.info("Admin sent waitlist launch email", {
			event: "admin_waitlist_launch_sent",
			actorUserId: context.user.id,
			organizationId,
			maxToSend: maxToSend ?? null,
			...result,
		});

		return result;
	});

/**
 * Sends one rendered launch email to the acting admin's own address, so the
 * copy can be checked in a real inbox before the real send. Touches no
 * waitlist rows; the unsubscribe link carries a dummy token.
 */
export const sendWaitlistLaunchTest = adminProcedure
	.route({
		method: "POST",
		path: "/admin/waitlist/send-launch-test",
		tags: ["Waitlist"],
		summary: "Send a test launch email to the acting admin",
	})
	.input(launchContentSchema.extend({ organizationId: z.string() }))
	.handler(async ({ input: { organizationId, ...content }, context }) => {
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		const firstName = context.user.name?.trim().split(/\s+/)[0] || context.user.email;
		const message = await buildLaunchEmail({
			recipient: { email: context.user.email, firstName, unsubscribeToken: "test" },
			content: { ...content, subject: `[Test] ${content.subject}` },
			marketingUrl: getMarketingUrl(),
		});
		await sendRawEmailBatch([message]);

		logger.info("Admin sent waitlist launch test email", {
			event: "admin_waitlist_launch_test_sent",
			actorUserId: context.user.id,
			organizationId,
		});

		return { to: context.user.email };
	});
