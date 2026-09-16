import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";
import { getBaseUrl } from "@repo/utils";

// Same recipients as report emails (notify-admins-of-report.ts): org owners + admins.
const PRIVILEGED_ROLES = ["owner", "admin"];

/** One `notification` email per club owner/admin. Never throws. */
export async function notifyClubAdmins(p: {
	organizationId: string;
	title: string;
	message: string;
	path: string;
}): Promise<void> {
	try {
		const admins = await db.member.findMany({
			where: { organizationId: p.organizationId, role: { in: PRIVILEGED_ROLES } },
			select: { user: { select: { email: true } } },
		});
		const link = `${getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000)}${p.path}`;

		for (const admin of admins) {
			const email = admin.user.email;
			if (!email) continue;
			try {
				await sendEmail({ to: email, templateId: "notification", context: { title: p.title, message: p.message, link } });
			} catch (error) {
				logger.warn("moderation.admin_email_failed", { organizationId: p.organizationId, error: String(error) });
			}
		}
	} catch (error) {
		logger.warn("moderation.admin_notify_failed", { organizationId: p.organizationId, error: String(error) });
	}
}
