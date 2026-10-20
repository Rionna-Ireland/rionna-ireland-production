import { LocaleLink } from "@i18n/routing";
import { getClubOrganization } from "@shared/lib/club";
import { getTranslations } from "next-intl/server";

export async function AboutTeaserSection() {
	const [t, tAbout, org] = await Promise.all([
		getTranslations("home.aboutTeaser"),
		getTranslations("about"),
		getClubOrganization().catch(() => null),
	]);
	const text = org?.metadata?.contact?.aboutText?.trim() || tAbout("fallbackAbout");
	const firstParagraph = text.split(/\n\s*\n/)[0] ?? text;

	return (
		<section className="gap-3.5 py-14 container flex flex-col items-center text-center">
			<span className="type-label text-plum">{t("eyebrow")}</span>
			<p className="max-w-xl text-lg text-ink-variant">{firstParagraph}</p>
			<LocaleLink href="/about" className="font-semibold text-ink">
				{t("more")} →
			</LocaleLink>
		</section>
	);
}
