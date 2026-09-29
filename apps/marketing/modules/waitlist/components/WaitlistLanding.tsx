import { config } from "@config";
import { LocaleLink } from "@i18n/routing";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";

import { PatternMosaic } from "./pattern/PatternMosaic";
import { WaitlistForm } from "./WaitlistForm";

// The Rionna horse-head mark (from @repo/ui Logo), used huge like the poster.
const MARK_PATH =
	"M1.57812 0C4.70988 12.3766 11.7725 20.0574 22.7227 24.2617V0H24.3018C28.0894 14.9685 37.6252 23.0699 52.8359 26.457C67.2212 27.0339 140.861 38.0695 140.861 123.354H50.4004V82C39.6035 110.044 27.9169 124.977 0 126.6V0H1.57812Z";

function Mark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 141 127" className={className} aria-hidden="true">
			<path d={MARK_PATH} fill="currentColor" />
		</svg>
	);
}

function rise(delayMs: number): CSSProperties {
	return { "--d": `${delayMs}ms` } as CSSProperties;
}

/**
 * S12-09: the whole site while public signup is closed (and the home page in
 * wireframe mode). A living "pattern cells" quilt beside the plum poster
 * panel. There is no nav or footer in this mode, so the panel carries its own
 * "Sign in" link and the legal links the consent checkbox relies on.
 */
export async function WaitlistLanding({ source }: { source?: string }) {
	const t = await getTranslations();

	return (
		<div className="theme-estate-night lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] grid min-h-svh bg-background text-foreground">
			<PatternMosaic className="lg:sticky lg:top-0 lg:h-svh h-[50vw] bg-[#172741]" />

			<section
				aria-labelledby="waitlist-heading"
				className="wl-panel relative isolate flex flex-col overflow-hidden"
			>
				{/* Poster move: the mark, blown up and bleeding off the panel. */}
				<Mark className="wl-mark pointer-events-none absolute bottom-[-6%] left-[-4%] -z-10 w-[108%] text-[#3A243C]" />

				<div className="px-6 pt-10 pb-10 sm:px-12 lg:px-16 xl:px-20 lg:pt-12 max-w-2xl gap-10 flex w-full flex-1 flex-col">
					<header
						className="wl-rise gap-4 flex items-center justify-between"
						style={rise(0)}
					>
						<p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground uppercase">
							{t("waitlist.eyebrow")}
						</p>
						<Mark className="h-7 w-auto text-[#CCA1D0]" />
					</header>

					<div className="lg:my-auto">
						<h1
							id="waitlist-heading"
							className="wl-rise font-medium font-display text-[clamp(3.25rem,5.4vw,5.75rem)] leading-[0.95] tracking-[-0.02em] text-balance text-foreground"
							style={rise(150)}
						>
							{t.rich("waitlist.headline", {
								em: (chunks) => (
									<em className="font-light text-[#CCA1D0] italic">{chunks}</em>
								),
							})}
						</h1>
						<p
							className="wl-rise mt-6 text-lg leading-relaxed max-w-md text-muted-foreground"
							style={rise(300)}
						>
							{t("waitlist.body")}
						</p>

						<div className="wl-rise mt-10" style={rise(450)}>
							<WaitlistForm source={source} />
						</div>
					</div>

					<footer
						className="wl-rise gap-x-6 gap-y-3 flex flex-wrap items-center font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase"
						style={rise(600)}
					>
						{config.saasUrl && (
							<a
								href={config.saasUrl}
								className="text-foreground underline decoration-[#CCA1D0] underline-offset-4 hover:text-[#CCA1D0]"
							>
								{t("waitlist.signInPrompt")} {t("waitlist.signIn")}
							</a>
						)}
						<nav
							aria-label={t("common.footer.legal")}
							className="gap-x-6 gap-y-3 flex flex-wrap"
						>
							<LocaleLink
								href="/legal/privacy-policy"
								className="hover:text-foreground"
							>
								{t("common.footer.privacyPolicy")}
							</LocaleLink>
							<LocaleLink href="/legal/terms" className="hover:text-foreground">
								{t("common.footer.termsAndConditions")}
							</LocaleLink>
							<LocaleLink
								href="/legal/cookie-policy"
								className="hover:text-foreground"
							>
								{t("common.footer.cookiePolicy")}
							</LocaleLink>
						</nav>
					</footer>
				</div>
			</section>
		</div>
	);
}
