import { config } from "@config";
import { LocaleLink } from "@i18n/routing";
import { getTranslations } from "next-intl/server";

import { WaitlistSection } from "./WaitlistSection";

/**
 * S12-09: the whole site while public signup is closed (and the home page in
 * wireframe mode). There is no nav or footer in that mode, so this carries its
 * own "Sign in" link for existing test accounts and the legal links the
 * consent checkbox relies on. Fills the viewport so no other surface shows.
 */
export async function WaitlistLanding({ source }: { source?: string }) {
	const t = await getTranslations();

	return (
		<WaitlistSection headingLevel="h1" source={source} className="min-h-svh">
			{config.saasUrl && (
				<p className="mt-12 text-xs font-mono tracking-[0.18em] text-muted-foreground uppercase">
					{t("waitlist.signInPrompt")}{" "}
					<a
						href={config.saasUrl}
						className="text-primary underline underline-offset-4 hover:text-foreground"
					>
						{t("waitlist.signIn")}
					</a>
				</p>
			)}
			<nav
				aria-label={t("common.footer.legal")}
				className="mt-8 gap-x-6 gap-y-2 text-xs flex flex-wrap text-muted-foreground"
			>
				<LocaleLink href="/legal/privacy-policy" className="hover:text-foreground">
					{t("common.footer.privacyPolicy")}
				</LocaleLink>
				<LocaleLink href="/legal/terms" className="hover:text-foreground">
					{t("common.footer.termsAndConditions")}
				</LocaleLink>
				<LocaleLink href="/legal/cookie-policy" className="hover:text-foreground">
					{t("common.footer.cookiePolicy")}
				</LocaleLink>
			</nav>
		</WaitlistSection>
	);
}
