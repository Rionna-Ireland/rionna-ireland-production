import { LocaleLink } from "@i18n/routing";
import { Button } from "@repo/ui/components/button";
import { getClubOrganization } from "@shared/lib/club";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "about" });
	return {
		title: t("title"),
		description: t("description"),
	};
}

export default async function AboutPage(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	setRequestLocale(locale);
	redirectIfWireframeMode(locale);

	const t = await getTranslations({ locale, namespace: "about" });
	const club = await getClubOrganization();

	const aboutText = club.metadata.contact?.aboutText ?? t("fallbackAbout");

	return (
		<div className="container py-16 md:py-24">
			<div className="max-w-3xl">
				<span className="font-mono text-xs tracking-[0.22em] uppercase text-foreground/70">
					{t("eyebrow")}
				</span>
				<h1 className="mt-4 font-display font-medium text-5xl md:text-6xl lg:text-7xl leading-tight">
					{t("title")}
				</h1>
				<p className="mt-6 text-lg md:text-xl text-foreground/70 leading-relaxed whitespace-pre-line">
					{aboutText}
				</p>
			</div>

			<div className="mt-16 gap-6 md:grid-cols-3 grid">
				{["openGates", "leadWithCare", "findJoy"].map((key) => (
					<div key={key} className="rounded-3xl border p-8 bg-card">
						<span className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/60">
							{t(`values.${key}.eyebrow`)}
						</span>
						<h3 className="mt-3 font-display font-medium text-2xl">
							{t(`values.${key}.title`)}
						</h3>
						<p className="mt-3 text-foreground/70">{t(`values.${key}.description`)}</p>
					</div>
				))}
			</div>

			<div className="mt-16">
				<Button size="lg" variant="primary" asChild>
					<LocaleLink href="/membership">{t("cta")}</LocaleLink>
				</Button>
			</div>
		</div>
	);
}
