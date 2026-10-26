"use client";

import { useActiveOrganization } from "@organizations/hooks/use-active-organization";
import { parseOrgMetadata } from "@repo/database/types";
import Image from "next/image";

// Official store badge URLs. These are the standard public assets Apple
// and Google publish for store-link badges.
const APPLE_BADGE_SRC =
	"https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg";
const GOOGLE_BADGE_SRC =
	"https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png";

export function InstallAppCard() {
	const { activeOrganization } = useActiveOrganization();
	const clubName = activeOrganization?.name ?? "the club";
	const rawMetadata =
		(activeOrganization?.metadata as unknown as string | null | undefined) ?? null;
	const metadata =
		typeof rawMetadata === "string" ? parseOrgMetadata(rawMetadata) : (rawMetadata ?? {});
	const appLinks = metadata.appLinks ?? {};
	const { iosUrl, androidUrl } = appLinks;
	const hasAny = Boolean(iosUrl || androidUrl);

	if (!hasAny) {
		return (
			<section className="p-6 md:p-10 rounded-xl border bg-card">
				<p className="text-xs tracking-wider font-mono text-muted-foreground uppercase">
					APP LAUNCHING SOON
				</p>
				<h3 className="mt-3 text-2xl md:text-3xl leading-tight font-display text-foreground">
					The {clubName} app is in final testing.
				</h3>
				<p className="mt-3 max-w-2xl text-foreground/75">
					We'll email you the moment it's live on the App Store and Play Store.
				</p>
			</section>
		);
	}

	return (
		<section className="p-6 md:p-10 rounded-xl border bg-card">
			<p className="text-xs tracking-wider font-mono text-muted-foreground uppercase">
				GET THE APP
			</p>
			<h3 className="mt-3 text-2xl md:text-3xl leading-tight font-display text-foreground">
				Our Stables, Pulse, and Community live in the app.
			</h3>

			<div className="mt-6 gap-3 flex flex-wrap items-center">
				{iosUrl ? (
					<a
						href={iosUrl}
						target="_blank"
						rel="noreferrer"
						aria-label="Download on the App Store"
					>
						<Image
							src={APPLE_BADGE_SRC}
							alt="Download on the App Store"
							width={160}
							height={48}
							unoptimized
						/>
					</a>
				) : null}
				{androidUrl ? (
					<a
						href={androidUrl}
						target="_blank"
						rel="noreferrer"
						aria-label="Get it on Google Play"
					>
						<Image
							src={GOOGLE_BADGE_SRC}
							alt="Get it on Google Play"
							width={180}
							height={54}
							unoptimized
						/>
					</a>
				) : null}
			</div>

			<div className="mt-8">
				<p className="text-xs tracking-wider font-mono text-muted-foreground uppercase">
					HOW IT WORKS
				</p>
				<ol className="mt-3 space-y-2 list-inside list-decimal text-foreground/85">
					<li>Install the app from the store.</li>
					<li>Sign in with the same email you used here.</li>
					<li>You're in — no extra setup.</li>
				</ol>
			</div>
		</section>
	);
}
