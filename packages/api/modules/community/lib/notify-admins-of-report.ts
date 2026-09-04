import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";
import { getBaseUrl } from "@repo/utils";

import { REPORT_REASON_LABELS } from "./report-reasons";
import type { ReportReason } from "./types";

// Better-Auth org roles that receive moderation-report emails. Mirrors the
// `PRIVILEGED_ROLES` idea in modules/members/lib/remove-member.ts — kept local
// rather than imported so this module doesn't reach into an unrelated feature.
const PRIVILEGED_ROLES = ["owner", "admin"];

/**
 * Fans out one email per club admin/owner when a member reports a post or
 * comment. Fire-and-forget from the caller (`void notifyAdminsOfReport(...)`)
 * — a failed send is caught and logged per-recipient, never thrown, so it
 * can't block or fail the report itself.
 */
export async function notifyAdminsOfReport(p: {
	organizationId: string;
	reason: ReportReason;
	excerpt: string;
}): Promise<void> {
	const admins = await db.member.findMany({
		where: { organizationId: p.organizationId, role: { in: PRIVILEGED_ROLES } },
		select: { user: { select: { email: true } } },
	});

	const link = `${getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000)}/admin/moderation`;
	const message = `${REPORT_REASON_LABELS[p.reason]}: "${p.excerpt}"`;

	for (const admin of admins) {
		const email = admin.user.email;
		if (!email) continue;
		try {
			await sendEmail({
				to: email,
				templateId: "notification",
				context: { title: "New content report", message, link },
			});
		} catch (error) {
			logger.warn("moderation.report_email_failed", {
				organizationId: p.organizationId,
				error: String(error),
			});
		}
	}
}
