import { config } from "@config";
import { LocaleLink } from "@i18n/routing";
import { Wordmark } from "@shared/components/brand/Wordmark";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { getClubOrganization } from "@shared/lib/club";
import { getTranslations } from "next-intl/server";

type SocialLinks = { instagram?: string; twitter?: string; facebook?: string; website?: string };

const colHead = "type-label text-[10px] text-lilac";
const link = "link-draw block w-fit text-[13px] text-ice hover:text-white hover:no-underline";

export async function Footer({ socialLinks }: { socialLinks?: SocialLinks }) {
	const t = await getTranslations();

	if (config.wireframeMode) {
		return (
			<footer className="bg-ink py-8 text-sm text-ice">
				<div className="gap-6 md:flex-row md:items-center md:justify-between container flex flex-col">
					<p className="type-label text-ice text-[10px]">
						© {new Date().getFullYear()} {config.appName}
					</p>
					<div className="gap-4 flex flex-wrap">
						<LocaleLink href="/legal/privacy-policy" className={link}>
							{t("common.footer.privacyPolicy")}
						</LocaleLink>
						<LocaleLink href="/legal/terms" className={link}>
							{t("common.footer.termsAndConditions")}
						</LocaleLink>
						<LocaleLink href="/legal/cookie-policy" className={link}>
							{t("common.footer.cookiePolicy")}
						</LocaleLink>
					</div>
				</div>
			</footer>
		);
	}

	const club = await getClubOrganization();
	const contactEmail = club.metadata.contact?.contactEmail;
	const social = Object.entries({
		Instagram: socialLinks?.instagram,
		Twitter: socialLinks?.twitter,
		Facebook: socialLinks?.facebook,
	}).filter((entry): entry is [string, string] => Boolean(entry[1]));

	return (
		<footer data-nav-tone="dark" className="bg-ink pb-12 text-white">
			<PatternMosaic colourway="navy" columns={12} rows={1} trigger="view" />
			<div className="gap-8 pt-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] container grid grid-cols-2">
				<div className="md:col-span-1 col-span-2">
					<Wordmark className="h-6 text-white w-auto" />
					<p className="mt-4 max-w-xs text-ice text-[13px]">
						{t("common.footer.tagline")}
					</p>
					{contactEmail && (
						<a
							href={`mailto:${contactEmail}`}
							className="type-label mt-4 text-ice block text-[10px]"
						>
							{contactEmail}
						</a>
					)}
					{social.length > 0 && (
						<div className="mt-4 gap-3 flex flex-wrap">
							{social.map(([name, href]) => (
								<a
									key={name}
									href={href}
									target="_blank"
									rel="noreferrer"
									className="type-label text-lilac text-[10px]"
								>
									{name}
								</a>
							))}
						</div>
					)}
				</div>

				<div className="gap-2.5 flex flex-col">
					<span className={colHead}>{t("common.footer.club")}</span>
					<LocaleLink href="/about" className={link}>
						{t("common.menu.about")}
					</LocaleLink>
					<LocaleLink href="/#horses" className={link}>
						{t("common.footer.ourHorses")}
					</LocaleLink>
					<LocaleLink href="/events" className={link}>
						{t("common.menu.events")}
					</LocaleLink>
					<LocaleLink href="/news" className={link}>
						{t("common.menu.news")}
					</LocaleLink>
				</div>

				<div className="gap-2.5 flex flex-col">
					<span className={colHead}>{t("common.footer.membership")}</span>
					<LocaleLink href="/membership" className={link}>
						{t("common.menu.join")}
					</LocaleLink>
					<LocaleLink href="/app" className={link}>
						{t("common.menu.theApp")}
					</LocaleLink>
				</div>

				<div className="gap-2.5 flex flex-col">
					<span className={colHead}>{t("common.footer.legal")}</span>
					<LocaleLink href="/legal/privacy-policy" className={link}>
						{t("common.footer.privacyPolicy")}
					</LocaleLink>
					<LocaleLink href="/legal/terms" className={link}>
						{t("common.footer.termsAndConditions")}
					</LocaleLink>
					<LocaleLink href="/legal/cookie-policy" className={link}>
						{t("common.footer.cookiePolicy")}
					</LocaleLink>
					<LocaleLink href="/contact" className={link}>
						{t("common.menu.contact")}
					</LocaleLink>
				</div>
			</div>

			<div className="mt-10 gap-3 border-white/15 pt-6 container flex flex-wrap items-center justify-between border-t">
				<p className="type-label text-ice text-[10px]">
					© {new Date().getFullYear()} {club.name}
				</p>
				<p className="type-label text-ice text-[10px]">{t("common.footer.poweredBy")}</p>
			</div>
		</footer>
	);
}
