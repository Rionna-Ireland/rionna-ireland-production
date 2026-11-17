import type { MarketingMessages } from "@repo/i18n";
import { applyPageCopy, getMessagesForLocale as getMessages } from "@repo/i18n";
import { getClubOrganization } from "@shared/lib/club";

export const getMessagesForLocale = async (locale: string): Promise<MarketingMessages> => {
	const [messages, org] = await Promise.all([
		getMessages<MarketingMessages>(locale as Parameters<typeof getMessages>[0], "marketing"),
		getClubOrganization(),
	]);
	// S17-09: admin copy edits are English-only, so other locales keep their translations.
	return locale === "en" ? applyPageCopy(messages, org.metadata?.pageCopy) : messages;
};
