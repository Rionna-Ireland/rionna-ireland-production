import { type RawEmail, getTemplate } from "@repo/mail";
import { getBaseUrl } from "@repo/utils";
import { z } from "zod";

/** Admin-authored launch email content (S12-09 Phase 2). */
export const launchContentSchema = z.object({
	subject: z.string().trim().min(1).max(200),
	heading: z.string().trim().min(1).max(200),
	body: z.string().trim().min(1).max(10_000),
	ctaUrl: z.string().trim().url().optional(),
});

export type LaunchContent = z.infer<typeof launchContentSchema>;

export function getMarketingUrl(): string {
	return getBaseUrl(process.env.NEXT_PUBLIC_MARKETING_URL, 3001).replace(/\/+$/, "");
}

/**
 * Renders the WaitlistLaunch template for one recipient: greeting by first
 * name, their own unsubscribe link, and RFC 8058 one-click unsubscribe
 * headers pointing at the marketing POST route.
 */
export async function buildLaunchEmail({
	recipient,
	content,
	marketingUrl,
}: {
	recipient: { email: string; firstName: string; unsubscribeToken: string };
	content: LaunchContent;
	marketingUrl: string;
}): Promise<RawEmail> {
	const token = encodeURIComponent(recipient.unsubscribeToken);
	const unsubscribeUrl = `${marketingUrl}/waitlist/unsubscribe?token=${token}`;
	const oneClickUrl = `${marketingUrl}/api/waitlist/unsubscribe?token=${token}`;

	const template = await getTemplate({
		templateId: "waitlistLaunch",
		context: {
			firstName: recipient.firstName,
			heading: content.heading,
			body: content.body,
			ctaUrl: content.ctaUrl ?? null,
			unsubscribeUrl,
		},
		locale: "en",
	});

	return {
		to: recipient.email,
		subject: content.subject,
		html: template.html,
		text: template.text,
		headers: {
			"List-Unsubscribe": `<${oneClickUrl}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		},
	};
}
