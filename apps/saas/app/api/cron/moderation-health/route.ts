/**
 * Auto-moderation health check (S12-08 decision 15). Daily via cron-job.eu with
 * `Authorization: Bearer $CRON_SECRET` — not vercel.json. Auto-moderation fails
 * open silently, so this is how anyone learns the OpenAI key or prepaid credit
 * (expires after 1 year) has lapsed.
 *
 * @see Architecture/specs/S12-08-auto-moderation.md
 */

import { isAuthorizedCronRequest } from "@repo/api/lib/cron-auth";
import { classifyText } from "@repo/api/modules/moderation/openai-moderation";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";

export const maxDuration = 30;

const BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview";

export async function POST(request: Request) {
	if (!isAuthorizedCronRequest(request)) {
		return new Response("Unauthorized", { status: 401 });
	}

	const result = await classifyText("health check");
	if (result.ok) {
		logger.info("moderation.health.ok", {});
		return Response.json({ ok: true });
	}

	const failure = { reason: result.reason, ...(result.status ? { status: result.status } : {}) };
	logger.warn("moderation.health.failed", failure);

	const to = process.env.OPS_ALERT_EMAIL;
	if (!to) {
		logger.warn("moderation.health.no_alert_email", {});
	} else {
		const detail = result.status ? `${result.reason}, HTTP ${result.status}` : result.reason;
		try {
			await sendEmail({
				to,
				templateId: "notification",
				context: {
					title: "Auto-moderation is not working",
					message: `OpenAI moderation check failed (${detail}). Posts are only screened by the word list until this is fixed. A 429 usually means the OpenAI organisation has no prepaid credit — check billing and auto recharge.`,
					link: BILLING_URL,
				},
			});
		} catch (error) {
			logger.warn("moderation.health.alert_failed", { error: String(error) });
		}
	}

	return Response.json({ ok: false, ...failure });
}
