import { AnalyticsScript } from "@analytics";
import { config } from "@config";
import { config as i18nConfig } from "@i18n/config";
import { cn } from "@repo/ui";
import { ClientProviders } from "@shared/components/ClientProviders";
import { ConsentBanner } from "@shared/components/ConsentBanner";
import { ConsentProvider } from "@shared/components/ConsentProvider";
import { Footer } from "@shared/components/Footer";
import { NavBar } from "@shared/components/NavBar";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { PropsWithChildren } from "react";

const ppEiko = localFont({
	src: [
		{ path: "../../public/fonts/PPEiko-Thin.otf", weight: "100", style: "normal" },
		{ path: "../../public/fonts/PPEiko-LightItalic.otf", weight: "300", style: "italic" },
		{ path: "../../public/fonts/PPEiko-Medium.otf", weight: "500", style: "normal" },
		{ path: "../../public/fonts/PPEiko-Heavy.otf", weight: "800", style: "normal" },
		{ path: "../../public/fonts/PPEiko-BlackItalic.otf", weight: "900", style: "italic" },
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

	return (
		<html lang={locale} suppressHydrationWarning className={`${ppEiko.variable} ${plusJakarta.variable} ${ibmPlexMono.variable}`}>
			<body className={cn("min-h-screen bg-background text-foreground antialiased")}>
				<ConsentProvider initialConsent={consentCookie?.value === "true"}>
					<NextIntlClientProvider locale={locale} messages={messages}>
						<ClientProviders>
							<ThemeProvider
								attribute="class"
								disableTransitionOnChange
								enableSystem={!config.wireframeMode}
								forcedTheme={config.wireframeMode ? "light" : undefined}
								defaultTheme={config.defaultTheme}
								themes={Array.from(config.enabledThemes)}
							>
								<NavBar />

								<main className="min-h-screen">{children}</main>

								<Footer />

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
