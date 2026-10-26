import { AnalyticsScript } from "@analytics";
import { config } from "@config";
import { ARRIVAL_INLINE_SCRIPT } from "@home/components/arrival-logic";
import { config as i18nConfig } from "@i18n/config";
import { cn } from "@repo/ui";
import { ClientProviders } from "@shared/components/ClientProviders";
import { ConsentBanner } from "@shared/components/ConsentBanner";
import { ConsentProvider } from "@shared/components/ConsentProvider";
import { Footer } from "@shared/components/Footer";
import { NavBar } from "@shared/components/NavBar";
import { getClubOrganization } from "@shared/lib/club";
import { isWaitlistView } from "@shared/lib/waitlist-view";
import { getSiteJoinCta } from "@shared/lib/website";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { PropsWithChildren } from "react";

const ppEiko = localFont({
	src: [
		{ path: "../../public/fonts/PPEiko-LightItalic.otf", weight: "300", style: "italic" },
		{ path: "../../public/fonts/PPEiko-Medium.otf", weight: "500", style: "normal" },
	],
	variable: "--font-display",
});

// Vendored (next/font/local) — next/font/google resolves against Google Fonts
// at build time and its pinned file URLs went 404, breaking Vercel builds.
const plusJakarta = localFont({
	src: "../../public/fonts/PlusJakartaSans-Variable.woff2",
	variable: "--font-sans",
	weight: "200 800",
});

const ibmPlexMono = localFont({
	src: "../../public/fonts/IBMPlexMono-Regular.woff2",
	variable: "--font-mono",
	weight: "400",
});

const locales = Object.keys(i18nConfig.locales) as string[];

export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

export default async function MarketingLayout({
	children,
	params,
}: PropsWithChildren<{ params: Promise<{ locale: string }> }>) {
	const { locale } = await params;

	if (!locales.includes(locale)) {
		notFound();
	}

	setRequestLocale(locale);

	const messages = await getMessages();

	const cookieStore = await cookies();
	const consentCookie = cookieStore.get("consent");

	// S12-09 / D39: one-page waitlist site until launch, so no site chrome.
	const waitlistOnly = await isWaitlistView();
	// Server-side so the client NavBar gets a plain serialisable CTA.
	const joinCta = waitlistOnly ? null : await getSiteJoinCta();
	const socialLinks =
		waitlistOnly || config.wireframeMode
			? undefined
			: (await getClubOrganization()).metadata.contact?.socialLinks;

	return (
		<html
			lang={locale}
			suppressHydrationWarning
			className={cn(
				ppEiko.variable,
				plusJakarta.variable,
				ibmPlexMono.variable,
				// S12-09: plum canvas behind the waitlist (overscroll, safe areas).
				waitlistOnly && "bg-[#57385A]",
			)}
		>
			<head>
				<script dangerouslySetInnerHTML={{ __html: ARRIVAL_INLINE_SCRIPT }} />
			</head>
			<body
				className={cn(
					"min-h-screen bg-background text-foreground antialiased",
					waitlistOnly && "theme-estate-night",
				)}
			>
				<ConsentProvider initialConsent={consentCookie?.value === "true"}>
					<NextIntlClientProvider locale={locale} messages={messages}>
						<ClientProviders>
							<ThemeProvider
								attribute="class"
								disableTransitionOnChange
								enableSystem={false}
								forcedTheme="light"
								defaultTheme={config.defaultTheme}
								themes={Array.from(config.enabledThemes)}
							>
								{joinCta && <NavBar joinCta={joinCta} />}

								<main className="min-h-screen">{children}</main>

								{!waitlistOnly && <Footer socialLinks={socialLinks} />}

								{!config.wireframeMode && (
									<>
										<ConsentBanner />
										<AnalyticsScript />
									</>
								)}
							</ThemeProvider>
						</ClientProviders>
					</NextIntlClientProvider>
				</ConsentProvider>
			</body>
		</html>
	);
}
