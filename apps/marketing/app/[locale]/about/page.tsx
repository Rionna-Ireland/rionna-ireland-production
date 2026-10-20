import { LocaleLink } from "@i18n/routing";
import { FoundersSection } from "@shared/components/FoundersSection";
import { MediaPlaceholder } from "@shared/components/MediaPlaceholder";
import { v2Button } from "@shared/components/ui/v2";
import { getClubOrganization } from "@shared/lib/club";
import { getWebsiteContent } from "@shared/lib/website";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "about" });
	return {
		title: t("title"),
		description: t("description"),
	};
}

const PILLARS = [
	{ key: "openGates", tile: "bg-ice-light", label: "text-ink-variant", text: "text-ink" },
	{ key: "leadWithCare", tile: "bg-lilac-light", label: "text-plum", text: "text-ink" },
	{ key: "findJoy", tile: "bg-sage", label: "text-forest", text: "text-forest" },
] as const;

export default async function AboutPage(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	setRequestLocale(locale);
	redirectIfWireframeMode(locale);

	const t = await getTranslations({ locale, namespace: "about" });
	const [club, { content }] = await Promise.all([getClubOrganization(), getWebsiteContent()]);
	const { about } = content;

	const aboutText = club.metadata.contact?.aboutText ?? t("fallbackAbout");

	return (
		<div className="bg-page">
			<section className="gap-10 py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-[56px] container grid">
				<div className="flex flex-col gap-[18px]">
					<span className="type-label text-plum">{t("storyLabel")}</span>
					<h1 className="type-display-xl text-balance">
						{about.storyTitle ?? t("title")}
					</h1>
					<p className="text-lg text-ink-variant leading-relaxed whitespace-pre-line">
						{aboutText}
					</p>
				</div>
				<div className="md:h-[320px] relative h-[240px] overflow-hidden rounded-lg">
					{about.photoUrl ? (
						<Image
							unoptimized
							src={about.photoUrl}
							alt=""
							fill
							sizes="(min-width: 1024px) 45vw, 100vw"
							className="object-cover"
						/>
					) : (
						<MediaPlaceholder tone="lilac" className="h-full" />
					)}
				</div>
			</section>

			<FoundersSection founders={about.founders} label={t("peopleLabel")} />

			<section className="gap-6 py-10 md:grid-cols-3 container grid">
				{PILLARS.map(({ key, tile, label, text }) => (
					<div key={key} className={`gap-3 p-8 flex flex-col rounded-lg ${tile}`}>
						<span className={`type-label ${label}`}>{t(`values.${key}.eyebrow`)}</span>
						<p className={`text-lg ${text}`}>{t(`values.${key}.description`)}</p>
					</div>
				))}
			</section>

			<section className="py-14 container">
				<LocaleLink href="/membership" className={v2Button({ variant: "primary" })}>
					{t("cta")}
				</LocaleLink>
			</section>
		</div>
	);
}
