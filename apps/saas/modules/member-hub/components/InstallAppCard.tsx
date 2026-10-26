"use client";

import { useActiveOrganization } from "@organizations/hooks/use-active-organization";
import { parseOrgMetadata } from "@repo/database/types";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function InstallAppCard() {
	const t = useTranslations("app.memberHub.installApp");
	const { activeOrganization } = useActiveOrganization();
	const rawMetadata =
		(activeOrganization?.metadata as unknown as string | null | undefined) ?? null;
	const metadata =
		typeof rawMetadata === "string" ? parseOrgMetadata(rawMetadata) : (rawMetadata ?? {});
	const iosUrl = metadata.appLinks?.iosUrl?.trim();
	const androidUrl = metadata.appLinks?.androidUrl?.trim();
	const comingSoon = (
		<span className="mt-2 type-label text-xs text-ink-variant">{t("comingSoon")}</span>
	);

	return (
		<section className="p-6 md:p-10 rounded-xl border bg-card">
			<p className="text-xs tracking-wider font-mono text-muted-foreground uppercase">
				{t("eyebrow")}
			</p>
			<h3 className="mt-3 text-2xl md:text-3xl leading-tight font-display text-foreground">
				{t("title")}
			</h3>

			<div className="mt-6 gap-x-5 gap-y-3 flex flex-wrap items-start">
				<div className="flex flex-col items-start">
					<StoreBadge href={iosUrl} className="inline-block">
						<img
							src="/store-badges/app-store-black.svg"
							alt={t("altIos")}
							width={120}
							height={40}
							className="h-10 w-auto"
						/>
					</StoreBadge>
					{!iosUrl && comingSoon}
				</div>
				<div className="flex flex-col items-start">
					{/* Google's PNG carries padding: 60px tall shows a 40px badge. */}
					<StoreBadge href={androidUrl} className="-my-2.5 -mx-2.5 inline-block">
						<img
							src="/store-badges/google-play.png"
							alt={t("altAndroid")}
							width={155}
							height={60}
							className="h-[60px] w-auto"
						/>
					</StoreBadge>
					{!androidUrl && comingSoon}
				</div>
			</div>

			<div className="mt-8">
				<p className="text-xs tracking-wider font-mono text-muted-foreground uppercase">
					{t("howTitle")}
				</p>
				<ol className="mt-3 space-y-2 list-inside list-decimal text-foreground/85">
					<li>{t("step1")}</li>
					<li>{t("step2")}</li>
					<li>{t("step3")}</li>
				</ol>
			</div>
		</section>
	);
}

/** Links to the store listing once Organization.metadata.appLinks has it; until then the badge is shown unlinked. */
function StoreBadge({
	href,
	className,
	children,
}: {
	href?: string;
	className: string;
	children: ReactNode;
}) {
	return href ? (
		<a href={href} target="_blank" rel="noopener" className={className}>
			{children}
		</a>
	) : (
		<span className={className}>{children}</span>
	);
}
