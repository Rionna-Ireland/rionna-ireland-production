"use client";

import { config } from "@config";
import { LocaleLink, useLocalePathname } from "@i18n/routing";
import { cn } from "@repo/ui";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@repo/ui/components/sheet";
import { Wordmark } from "@shared/components/brand/Wordmark";
import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { v2Button } from "@shared/components/ui/v2";
import type { JoinCta } from "@shared/lib/join-url";
import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import NextLink from "next/link";
import { useEffect, useState } from "react";

export function NavBar({ joinCta }: { joinCta: JoinCta }) {
	const t = useTranslations();
	const localePathname = useLocalePathname();

	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	useEffect(() => {
		setMobileMenuOpen(false);
	}, [localePathname]);

	const menuItems: { label: string; href: string }[] = config.wireframeMode
		? [{ label: t("common.menu.membership"), href: "/membership" }]
		: [
				{ label: t("common.menu.about"), href: "/about" },
				{ label: t("common.menu.horses"), href: "/#horses" },
				{ label: t("common.menu.news"), href: "/news" },
				{ label: t("common.menu.events"), href: "/events" },
			];

	const isMenuItemActive = (href: string) =>
		!href.includes("#") && localePathname.startsWith(href);

	// Signup mode lands on the Join page (/membership), whose own CTA goes to SaaS signup.
	const navJoinCta: JoinCta =
		joinCta.mode === "signup" ? { ...joinCta, href: "/membership", external: false } : joinCta;
	const joinLabel = joinCta.labelKey ? t(joinCta.labelKey) : t("common.menu.join");

	return (
		<nav
			className="top-0 border-outline bg-white/90 backdrop-blur sticky z-50 w-full border-b"
			data-test="navigation"
		>
			<div className="container">
				<div className="gap-6 py-4 lg:py-5 flex items-center justify-between">
					<LocaleLink
						href="/"
						className="text-ink block hover:no-underline"
						aria-label={config.appName}
					>
						<Wordmark className="h-6 w-auto" />
					</LocaleLink>

					<div className="lg:flex hidden items-center gap-[30px]">
						{menuItems.map((menuItem) => (
							<LocaleLink
								key={menuItem.href}
								href={menuItem.href}
								className={cn(
									"text-sm font-medium text-ink-variant hover:text-ink hover:no-underline",
									isMenuItemActive(menuItem.href) && "text-ink",
								)}
								prefetch
							>
								{menuItem.label}
							</LocaleLink>
						))}
						{config.saasUrl && (
							<NextLink
								href={config.saasUrl}
								className="text-sm font-medium text-ink hover:no-underline"
								prefetch
							>
								{t("common.menu.login")}
							</NextLink>
						)}
						<JoinCtaLink cta={navJoinCta} className={v2Button({ variant: "primary" })}>
							{joinLabel}
						</JoinCtaLink>
					</div>

					<Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
						<SheetTrigger asChild>
							<button
								type="button"
								className="size-10 border-outline text-ink lg:hidden flex items-center justify-center rounded-lg border"
								aria-label={t("common.aria.menu")}
							>
								<MenuIcon className="size-5" />
							</button>
						</SheetTrigger>
						<SheetContent className="bg-paper w-[280px]" side="right">
							<SheetTitle className="sr-only">{t("common.aria.menu")}</SheetTitle>
							<div className="gap-1 px-2 pt-6 flex flex-col items-start">
								{menuItems.map((menuItem) => (
									<LocaleLink
										key={menuItem.href}
										href={menuItem.href}
										onClick={() => setMobileMenuOpen(false)}
										className={cn(
											"py-2 text-base font-medium text-ink-variant block hover:no-underline",
											isMenuItemActive(menuItem.href) && "text-ink",
										)}
										prefetch
									>
										{menuItem.label}
									</LocaleLink>
								))}
								{config.saasUrl && (
									<NextLink
										href={config.saasUrl}
										className="py-2 text-base font-medium text-ink block hover:no-underline"
										onClick={() => setMobileMenuOpen(false)}
										prefetch
									>
										{t("common.menu.login")}
									</NextLink>
								)}
								<JoinCtaLink
									cta={navJoinCta}
									onClick={() => setMobileMenuOpen(false)}
									className={cn(v2Button({ variant: "primary" }), "mt-4 w-full")}
								>
									{joinLabel}
								</JoinCtaLink>
							</div>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</nav>
	);
}
