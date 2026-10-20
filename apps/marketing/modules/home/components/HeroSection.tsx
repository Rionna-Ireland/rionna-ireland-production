import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { MediaPlaceholder } from "@shared/components/MediaPlaceholder";
import { v2Button } from "@shared/components/ui/v2";
import { getSiteJoinCta, getWebsiteContent } from "@shared/lib/website";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

import { HeroMedia } from "./HeroMedia";

export async function HeroSection() {
	const [t, tRoot, { content, featuredHorses }, joinCta] = await Promise.all([
		getTranslations("home.hero"),
		getTranslations(),
		getWebsiteContent(),
		getSiteJoinCta(),
	]);
	const { hero } = content;

	return (
		<section className="bg-welcome-navy text-white">
			<div className="gap-10 py-16 lg:grid-cols-2 lg:items-center lg:py-[72px] container grid">
				<div className="gap-5 flex flex-col">
					<span className="type-label text-lilac">{hero.eyebrow ?? t("eyebrow")}</span>
					<h1 className="type-display-xl text-balance">{hero.title ?? t("title")}</h1>
					<p className="max-w-xl text-lg text-white/80">
						{hero.subtitle ?? t("subtitle")}
					</p>
					<div className="gap-3.5 flex flex-wrap">
						<JoinCtaLink cta={joinCta} className={v2Button({ variant: "onDark" })}>
							{joinCta.labelKey ? tRoot(joinCta.labelKey) : t("joinCta")}
						</JoinCtaLink>
						{featuredHorses.length > 0 && (
							<a href="#horses" className={v2Button({ variant: "ghostOnDark" })}>
								{t("horsesCta")}
							</a>
						)}
					</div>
				</div>
				<div className="md:h-[420px] relative h-[280px] overflow-hidden rounded-lg">
					{hero.videoUrl ? (
						<HeroMedia imageUrl={hero.imageUrl} videoUrl={hero.videoUrl} />
					) : hero.imageUrl ? (
						<Image
							unoptimized
							src={hero.imageUrl}
							alt=""
							fill
							priority
							sizes="(min-width: 1024px) 50vw, 100vw"
							className="object-cover"
						/>
					) : (
						<MediaPlaceholder tone="ice" className="h-full" />
					)}
				</div>
			</div>
		</section>
	);
}
