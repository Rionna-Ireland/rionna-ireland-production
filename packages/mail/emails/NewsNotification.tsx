import { Hr, Img, Text } from "@react-email/components";
import React from "react";
import { createTranslator } from "use-intl/core";

import PrimaryButton from "../components/PrimaryButton";
import Wrapper from "../components/Wrapper";
import { defaultLocale, defaultTranslations } from "../lib/translations";
import type { BaseMailProps } from "../types";

export function NewsNotification({
	title,
	subtitle,
	featuredImageUrl,
	postUrl,
	clubName,
	locale,
	translations,
}: {
	title: string;
	subtitle?: string | null;
	featuredImageUrl?: string | null;
	postUrl: string;
	clubName: string;
} & BaseMailProps) {
	const t = createTranslator({
		locale,
		messages: {
			...translations.newsNotification,
			common: translations.common,
		},
	});

	return (
		<Wrapper>
			<Text className="text-lg font-semibold text-muted-foreground">
				{t("heading", { clubName })}
			</Text>

			{featuredImageUrl ? (
				<Img
					src={featuredImageUrl}
					alt={title}
					width="560"
					style={{
						width: "100%",
						borderRadius: "0.75rem",
						marginBottom: "1rem",
					}}
				/>
			) : null}

			<Text className="text-2xl font-bold">{title}</Text>

			{subtitle ? <Text>{subtitle}</Text> : null}

			<PrimaryButton href={postUrl}>
				{t("cta")} &rarr;
			</PrimaryButton>

			<Hr className="border-border my-4" />

			<Text className="text-sm text-muted-foreground">
				{t("footer", { clubName })}
			</Text>
		</Wrapper>
	);
}

NewsNotification.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
	title: "Stable Update: New Arrivals",
	subtitle:
		"Three exciting new horses have joined the Rionna stable.",
	featuredImageUrl: null,
	postUrl: "https://app.rionna.com/news/stable-update",
	clubName: "Rionna",
};

export default NewsNotification;
