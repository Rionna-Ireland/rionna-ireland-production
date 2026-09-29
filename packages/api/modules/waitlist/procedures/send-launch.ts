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
 * Recipients per run when the admin gives no `maxToSend`. Sized so a run
 * finishes well inside the 60 s API route limit; `MAX_LAUNCH_PER_RUN` caps an
 * explicit value for the same reason. Keep in sync with the admin form
 * (`launch-form-values.ts`).
 */
export const DEFAULT_LAUNCH_PER_RUN = 500;
export const MAX_LAUNCH_PER_RUN = 2000;

/**
 * S12-09 Phase 2: send the launch email to the waitlist.
 *
 * Renders WaitlistLaunch per recipient (first-name greeting + their own
 * unsubscribe link and RFC 8058 headers) and sends in chunks of
 * MAX_BATCH_SIZE, following send-news-notification.ts.
 *
 * Concurrency-safe via claim-before-send: each chunk is first claimed by
 * stamping `launchEmailSentAt` on rows that are still pending
 * (`updateManyAndReturn`, a single conditional UPDATE … RETURNING), and only
 * the rows this run actually claimed are sent. A concurrent run (double
 * click, second admin tab) finds those rows already stamped and skips them.
 * If the provider rejects a chunk, its claim is released so a re-run resumes.
 * Each run sends at most `maxToSend` (default DEFAULT_LAUNCH_PER_RUN), which
 * also spreads a big list over days under the Resend daily cap.
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
			maxToSend: z.number().int().min(1).max(MAX_LAUNCH_PER_RUN).optional(),
		}),
	)
	.handler(async ({ input: { organizationId, maxToSend, ...content }, context }) => {
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		const limit = maxToSend ?? DEFAULT_LAUNCH_PER_RUN;
		const candidates = await db.waitlistSignup.findMany({
			where: pendingWhere(organizationId),
			select: { id: true },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			take: limit,
		});

		const marketingUrl = getMarketingUrl();
		let attempted = 0;
		let sent = 0;
		let failedChunks = 0;

		for (let start = 0; start < candidates.length; start += MAX_BATCH_SIZE) {
			const chunkIds = candidates.slice(start, start + MAX_BATCH_SIZE).map((row) => row.id);
			const claimedAt = new Date();
			// Claim first: only rows still pending are stamped, and RETURNING
			// tells us exactly which ones this run won.
			const claimed = await db.waitlistSignup.updateManyAndReturn({
				where: { ...pendingWhere(organizationId), id: { in: chunkIds } },
				data: { launchEmailSentAt: claimedAt },
				select: { id: true, email: true, firstName: true, unsubscribeToken: true },
			});
			if (claimed.length === 0) continue;
			attempted += claimed.length;

			try {
				const messages = await Promise.all(
					claimed.map((recipient) =>
						buildLaunchEmail({ recipient, content, marketingUrl }),
					),
				);
				await sendRawEmailBatch(messages);
				sent += claimed.length;
			} catch (error) {
				// Release the claim so a re-run picks the chunk up again.
				failedChunks += 1;
				await db.waitlistSignup.updateMany({
					where: {
						id: { in: claimed.map((recipient) => recipient.id) },
						launchEmailSentAt: claimedAt,
					},
					data: { launchEmailSentAt: null },
				});
				logger.error("Waitlist launch batch failed", {
					event: "admin_waitlist_launch_chunk_failed",
					organizationId,
					chunkStart: start,
					chunkSize: claimed.length,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		const remaining = await db.waitlistSignup.count({ where: pendingWhere(organizationId) });

		const result = { attempted, sent, failedChunks, remaining };
		logger.info("Admin sent waitlist launch email", {
			event: "admin_waitlist_launch_sent",
			actorUserId: context.user.id,
			organizationId,
			maxToSend: limit,
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
