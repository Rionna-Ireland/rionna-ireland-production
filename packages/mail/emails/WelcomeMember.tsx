import { Hr, Text } from "@react-email/components";
import React from "react";
import { createTranslator } from "use-intl/core";

import PrimaryButton from "../components/PrimaryButton";
import Wrapper from "../components/Wrapper";
import { defaultLocale, defaultTranslations } from "../lib/translations";
import type { BaseMailProps } from "../types";

export function WelcomeMember({
	memberName,
	clubName,
	communityUrl,
	locale,
	translations,
}: {
	memberName: string;
	clubName: string;
	communityUrl: string;
} & BaseMailProps) {
	const t = createTranslator({
		locale,
		messages: {
			...translations.welcomeMember,
			common: translations.common,
		},
	});

	return (
		<Wrapper>
			<Text className="text-2xl font-bold">
				{t("heading", { clubName })}
			</Text>

			<Text>{t("greeting", { memberName })}</Text>

			<Text>{t("intro")}</Text>

			<Text>
				1. {t("step1", { clubName })}
				{"\n"}2. {t("step2")}
				{"\n"}3. {t("step3")}
				{"\n"}4. {t("step4")}
			</Text>

			<PrimaryButton href={communityUrl}>
				{t("cta")} &rarr;
			</PrimaryButton>

			<Hr className="border-border my-4" />

			<Text className="text-sm text-muted-foreground">{t("footer")}</Text>
		</Wrapper>
	);
}

WelcomeMember.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
	memberName: "John Doe",
	clubName: "Rionna",
	communityUrl: "https://community.rionna.com",
};

export default WelcomeMember;
