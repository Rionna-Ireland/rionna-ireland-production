import { config } from "@config";
import { cn, Toaster } from "@repo/ui";
import { ApiClientProvider } from "@shared/components/ApiClientProvider";
import { ClientProviders } from "@shared/components/ClientProviders";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import localFont from "next/font/local";

import "./globals.css";
import "cropperjs/dist/cropper.css";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { PropsWithChildren } from "react";

const ppEiko = localFont({
	src: [
		{ path: "../public/fonts/PPEiko-Thin.otf", weight: "100", style: "normal" },
		{ path: "../public/fonts/PPEiko-LightItalic.otf", weight: "300", style: "italic" },
		{ path: "../public/fonts/PPEiko-Medium.otf", weight: "500", style: "normal" },
		{ path: "../public/fonts/PPEiko-Heavy.otf", weight: "800", style: "normal" },
		{ path: "../public/fonts/PPEiko-BlackItalic.otf", weight: "900", style: "italic" },
	],
	variable: "--font-display",
});

// Vendored (next/font/local) — next/font/google resolves against Google Fonts
// at build time and its pinned file URLs went 404, breaking Vercel builds.
const plusJakarta = localFont({
	src: "../public/fonts/PlusJakartaSans-Variable.woff2",
	variable: "--font-sans",
	weight: "200 800",
});

const ibmPlexMono = localFont({
	src: "../public/fonts/IBMPlexMono-Regular.woff2",
	variable: "--font-mono",
	weight: "400",
});

export const metadata: Metadata = {
	title: {
		absolute: config.appName,
		default: config.appName,
		template: `%s | ${config.appName}`,
	},
};

export default async function RootLayout({ children }: PropsWithChildren) {
	const locale = await getLocale();
	const messages = await getMessages();

	return (
		<html lang={locale} suppressHydrationWarning className={`${ppEiko.variable} ${plusJakarta.variable} ${ibmPlexMono.variable}`}>
			<body className={cn("min-h-screen bg-background text-foreground antialiased")}>
				<NuqsAdapter>
					<NextIntlClientProvider messages={messages}>
						<ThemeProvider
							attribute="class"
							disableTransitionOnChange
							enableSystem
							defaultTheme={config.defaultTheme}
							themes={Array.from(config.enabledThemes)}
						>
							<ApiClientProvider>
								<ClientProviders>
									{children}

									<Toaster position="top-right" />
								</ClientProviders>
							</ApiClientProvider>
						</ThemeProvider>
					</NextIntlClientProvider>
				</NuqsAdapter>
			</body>
		</html>
	);
}
