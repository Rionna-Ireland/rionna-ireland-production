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
import { useEffect, useRef, useState } from "react";

import { type NavTone, type ToneSection, toneAt } from "./nav-tone";

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
				{ label: t("common.menu.news"), href: "/news" },
				{ label: t("common.menu.events"), href: "/events" },
				{ label: t("common.menu.app"), href: "/app" },
			];

	const isMenuItemActive = (href: string) =>
		!href.includes("#") && localePathname.startsWith(href);

	// Signup mode lands on the Join page (/membership), whose own CTA goes to SaaS signup.
	const navJoinCta: JoinCta =
		joinCta.mode === "signup" ? { ...joinCta, href: "/membership", external: false } : joinCta;
	const joinLabel = joinCta.labelKey
		? t(joinCta.labelKey)
		: joinCta.mode === "signup"
			? t("common.menu.becomeMember")
			: t("common.menu.join");

	const navRef = useRef<HTMLElement>(null);
	const [tone, setTone] = useState<NavTone>("light");

	// Tone follows the [data-nav-tone] section under the bar's centre; rAF-throttled.
	useEffect(() => {
		let frame = 0;
		const update = () => {
			frame = 0;
			const nav = navRef.current;
			if (!nav) return;
			const navRect = nav.getBoundingClientRect();
			const sections: ToneSection[] = Array.from(
				document.querySelectorAll<HTMLElement>("[data-nav-tone]"),
			).map((el) => {
				const r = el.getBoundingClientRect();
				return {
					top: r.top,
					bottom: r.bottom,
					tone: el.dataset.navTone === "dark" ? "dark" : "light",
				};
			});
			setTone(toneAt(sections, navRect.top + navRect.height / 2));
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	}, [localePathname]);

	const dark = tone === "dark";

	return (
		<div className="inset-x-3 top-3 pointer-events-none fixed z-50">
			<nav
				ref={navRef}
				className="nav-glass pointer-events-auto container"
				data-tone={tone}
				data-edge={localePathname === "/" ? "ice" : undefined}
				data-test="navigation"
			>
				<div>
					<div className="gap-2 sm:gap-6 py-3 lg:py-3.5 flex items-center justify-between">
						<LocaleLink
							href="/"
							className="block hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-4"
							aria-label={config.appName}
						>
							<Wordmark className="h-5 sm:h-6 w-auto shrink-0" />
						</LocaleLink>

						<div className="lg:flex hidden items-center gap-[30px]">
							{menuItems.map((menuItem) => (
								<LocaleLink
									key={menuItem.href}
									href={menuItem.href}
									className={cn(
										"link-draw text-sm font-medium opacity-75 hover:no-underline hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-4",
										isMenuItemActive(menuItem.href) && "opacity-100",
									)}
									prefetch
								>
									{menuItem.label}
								</LocaleLink>
							))}
							{config.saasUrl && (
								<NextLink
									href={config.saasUrl}
									className="link-draw text-sm font-medium hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-4"
									prefetch
								>
									{t("common.menu.login")}
								</NextLink>
							)}
							<JoinCtaLink
								cta={navJoinCta}
								className={v2Button({ variant: dark ? "onDark" : "primary" })}
							>
								{joinLabel}
							</JoinCtaLink>
						</div>

						<JoinCtaLink
							cta={navJoinCta}
							className={cn(
								v2Button({ variant: dark ? "onDark" : "primary", size: "md" }),
								"lg:hidden ml-auto",
							)}
						>
							<span className="sm:hidden">{t("common.menu.join")}</span>
							<span className="sm:inline hidden">{joinLabel}</span>
						</JoinCtaLink>

						<Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
							<SheetTrigger asChild>
								<button
									type="button"
									className="size-11 lg:hidden flex shrink-0 items-center justify-center rounded-lg border border-current/20 focus-visible:outline-2 focus-visible:outline-offset-2"
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
										className={cn(
											v2Button({ variant: "primary" }),
											"mt-4 w-full",
										)}
									>
										{joinLabel}
									</JoinCtaLink>
								</div>
							</SheetContent>
						</Sheet>
					</div>
				</div>
			</nav>
		</div>
	);
}
