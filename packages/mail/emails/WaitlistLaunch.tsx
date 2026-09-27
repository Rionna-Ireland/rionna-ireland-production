import { Hr, Link, Text } from "@react-email/components";
import React from "react";
import { createTranslator } from "use-intl/core";

import PrimaryButton from "../components/PrimaryButton";
import Wrapper from "../components/Wrapper";
import { defaultLocale, defaultTranslations } from "../lib/translations";
import type { BaseMailProps } from "../types";

/**
 * S12-09 Phase 2: the one-off launch announcement sent to the waitlist.
 * Rendered per recipient (greeting by first name + their own unsubscribe
 * link). `heading` / `body` are admin-authored; blank lines split paragraphs.
 */
export function WaitlistLaunch({
	firstName,
	heading,
	body,
	ctaUrl,
	unsubscribeUrl,
	locale,
	translations,
}: {
	firstName: string;
	heading: string;
	body: string;
	ctaUrl?: string | null;
	unsubscribeUrl: string;
} & BaseMailProps) {
	const t = createTranslator({
		locale,
		messages: translations.waitlistLaunch,
	});

	const paragraphs = body
		.split(/\r?\n\s*\r?\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);

	return (
		<Wrapper>
			<Text className="text-2xl font-bold">{heading}</Text>

			<Text>{t("greeting", { firstName })}</Text>

			{paragraphs.map((paragraph, index) => (
				<Text key={index} style={{ whiteSpace: "pre-line" }}>
					{paragraph}
				</Text>
			))}

			{ctaUrl ? <PrimaryButton href={ctaUrl}>{t("cta")} &rarr;</PrimaryButton> : null}

			<Hr className="my-4 border-border" />

			<Text className="text-xs text-muted-foreground">
				{t("footer")}{" "}
				<Link href={unsubscribeUrl} className="text-muted-foreground underline">
					{t("unsubscribe")}
				</Link>
			</Text>
		</Wrapper>
	);
}

WaitlistLaunch.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
	firstName: "Seán",
	heading: "Rionna is live",
	body: "The Rionna app is now available.\n\nJoin the club to follow our horses, get race-day updates and meet the other members.",
	ctaUrl: "https://rionna.ie",
	unsubscribeUrl: "https://rionna.ie/waitlist/unsubscribe?token=preview",
};

export default WaitlistLaunch;
