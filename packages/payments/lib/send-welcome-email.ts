/**
 * Welcome email sender
 *
 * Called from the Stripe subscription.created webhook handler to send
 * a welcome email to new members.
 *
 * Lives in @repo/payments (not @repo/api) to avoid circular deps.
 *
 * @see Architecture/specs/S2-05-transactional-email.md
 */

import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";

export async function sendWelcomeEmail(
	userId: string,
	organizationId: string,
): Promise<void> {
	try {
		const user = await db.user.findUnique({ where: { id: userId } });
		const org = await db.organization.findUnique({
			where: { id: organizationId },
		});

		if (!user || !org) {
			return;
		}

		const metadata = parseOrgMetadata(org.metadata as string | null);
		const appLinks = metadata.appLinks ?? {};

		await sendEmail({
			to: user.email,
			templateId: "welcomeMember",
			context: {
				memberName: user.name ?? user.email,
				clubName: org.name,
				iosUrl: appLinks.iosUrl ?? null,
				androidUrl: appLinks.androidUrl ?? null,
			},
			locale: "en",
		});
	} catch (error) {
		logger.error("Failed to send welcome email", { userId, error });
	}
}
