import { config } from "@config";
import { LocaleLink } from "@i18n/routing";
import { getClubOrganization } from "@shared/lib/club";
import { Logo } from "@repo/ui";
import { getTranslations } from "next-intl/server";

export async function Footer() {
	const t = await getTranslations();

	if (config.wireframeMode) {
		return (
			<footer className="py-8 text-sm border-t text-foreground/60">
				<div className="container gap-6 md:flex-row md:items-center md:justify-between flex flex-col">
					<p className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/50">
						© {new Date().getFullYear()} {config.appName}
					</p>
					<div className="gap-4 flex flex-wrap">
						<LocaleLink href="/legal/privacy-policy" className="block">
							{t("common.footer.privacyPolicy")}
						</LocaleLink>
						<LocaleLink href="/legal/terms" className="block">
							{t("common.footer.termsAndConditions")}
						</LocaleLink>
						<LocaleLink href="/legal/cookie-policy" className="block">
							{t("common.footer.cookiePolicy")}
						</LocaleLink>
					</div>
				</div>
			</footer>
		);
	}

	const club = await getClubOrganization();
	const contact = club.metadata.contact ?? {};
	const social = contact.socialLinks ?? {};

	return (
		<footer className="py-12 text-sm border-t text-foreground/60">
			<div className="container gap-8 md:grid-cols-4 grid grid-cols-1">
				<div className="md:col-span-2">
					<Logo className="opacity-80" />
					<p className="mt-4 max-w-sm text-foreground/60">
						{t("common.footer.tagline")}
					</p>
					{contact.contactEmail && (
						<a
							href={`mailto:${contact.contactEmail}`}
							className="mt-4 font-mono text-xs tracking-[0.2em] uppercase text-foreground/60 block"
						>
							{contact.contactEmail}
						</a>
					)}
				</div>

				<div className="gap-2 flex flex-col">
					<span className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/50">
						{t("common.footer.explore")}
					</span>
					<LocaleLink href="/about" className="block">
						{t("common.menu.about")}
					</LocaleLink>
					<LocaleLink href="/membership" className="block">
						{t("common.menu.membership")}
					</LocaleLink>
					<LocaleLink href="/news" className="block">
						{t("common.menu.news")}
					</LocaleLink>
					<LocaleLink href="/contact" className="block">
						{t("common.menu.contact")}
					</LocaleLink>
				</div>

				<div className="gap-2 flex flex-col">
					<span className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/50">
						{t("common.footer.legal")}
					</span>
					<LocaleLink href="/legal/privacy-policy" className="block">
						{t("common.footer.privacyPolicy")}
					</LocaleLink>
					<LocaleLink href="/legal/terms" className="block">
						{t("common.footer.termsAndConditions")}
					</LocaleLink>
					<LocaleLink href="/legal/cookie-policy" className="block">
						{t("common.footer.cookiePolicy")}
					</LocaleLink>
					{(social.instagram || social.twitter || social.facebook || social.website) && (
						<div className="mt-4 gap-3 flex flex-wrap">
							{social.instagram && (
								<a
									href={social.instagram}
									target="_blank"
									rel="noreferrer"
									className="font-mono text-[10px] tracking-[0.2em] uppercase"
								>
									Instagram
								</a>
							)}
							{social.twitter && (
								<a
									href={social.twitter}
									target="_blank"
									rel="noreferrer"
									className="font-mono text-[10px] tracking-[0.2em] uppercase"
								>
									Twitter
								</a>
							)}
							{social.facebook && (
								<a
									href={social.facebook}
									target="_blank"
									rel="noreferrer"
									className="font-mono text-[10px] tracking-[0.2em] uppercase"
								>
									Facebook
								</a>
							)}
						</div>
					)}
				</div>
			</div>

			<div className="container mt-10 pt-6 border-t flex flex-wrap items-center justify-between gap-3">
				<p className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/50">
					© {new Date().getFullYear()} {club.name}
				</p>
				<p className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/50">
					{t("common.footer.poweredBy")}
				</p>
			</div>
		</footer>
	);
}
