import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import { getClubEvents, type PublicClubEvent } from "@shared/lib/club";
import { getSiteJoinCta, getWebsiteContent } from "@shared/lib/website";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";

import { heroWordStepMs } from "../lib/hero-timing";
import { pickNextEvent } from "../lib/next-event";
import { HeroEventCard } from "./HeroEventCard";
import { HeroMedia } from "./HeroMedia";

// shortcut: temporary hero clip until the club supplies footage; upload via Admin → Website → Hero video, then delete public/hero/
const TEMP_HERO = { videoUrl: "/hero/temp-hero.mp4", imageUrl: "/hero/temp-hero.webp" };

async function readNextEvent(): Promise<PublicClubEvent | null> {
	try {
		const { items } = await getClubEvents();
		return pickNextEvent(items, new Date());
	} catch {
		return null;
	}
}

export async function HeroSection() {
	const [t, tRoot, { content, featuredHorses }, joinCta, nextEvent] = await Promise.all([
		getTranslations("home.hero"),
		getTranslations(),
		getWebsiteContent(),
		getSiteJoinCta(),
		readNextEvent(),
	]);
	const { hero } = content;
	const title = hero.title ?? t("title");
	// Admin video (+poster) -> admin image alone -> temporary clip.
	const admin = Boolean(hero.videoUrl || hero.imageUrl);
	const media = hero.videoUrl
		? { videoUrl: hero.videoUrl, imageUrl: hero.imageUrl }
		: hero.imageUrl
			? { videoUrl: undefined, imageUrl: hero.imageUrl }
			: TEMP_HERO;

	return (
		<section
			data-nav-tone="dark"
			className="hero lg:min-h-svh lg:grid-cols-[45fr_20fr_35fr] bg-welcome-navy text-white grid"
		>
			<div className="grain px-6 pt-32 pb-12 lg:px-12 lg:pb-16 lg:min-h-0 relative isolate flex min-h-svh flex-col justify-end bg-[#0f1b30]">
				<span className="type-label hero-rise mb-6 text-lilac">
					{hero.eyebrow ?? t("eyebrow")}
				</span>
				<MaskedText
					as="h1"
					text={title}
					style={
						{
							"--hero-step": `${heroWordStepMs(title.split(/\s+/).filter(Boolean).length)}ms`,
						} as CSSProperties
					}
					className="hero-title lg:text-[clamp(4.5rem,6.4vw,7.5rem)] font-display text-[clamp(3.5rem,14vw,6rem)] leading-[0.92] tracking-[-0.02em] text-balance"
				/>
				<p
					className="hero-rise mt-8 max-w-md text-lg text-white/80"
					style={{ "--n": 1 } as never}
				>
					{hero.subtitle ?? t("subtitle")}
				</p>
				<div
					className="hero-rise mt-8 gap-3.5 flex flex-wrap"
					style={{ "--n": 2 } as never}
				>
					<JoinCtaLink
						cta={joinCta}
						className={`group ${v2Button({ variant: "accent" })}`}
					>
						{joinCta.labelKey ? tRoot(joinCta.labelKey) : t("joinCta")}
						<ArrowRightIcon className="ml-2 size-4 group-hover:translate-x-1 transition-transform duration-(--dur-hover)" />
					</JoinCtaLink>
					{featuredHorses.length > 0 && (
						<a href="#horses" className={v2Button({ variant: "ghostOnDark" })}>
							{t("horsesCta")}
						</a>
					)}
				</div>
			</div>

			<div className="hero-strip lg:aspect-auto bg-ink relative aspect-[4/5] overflow-hidden">
				<div className="hero-drift inset-x-0 top-0 absolute h-[108%]">
					<HeroMedia
						imageUrl={media.imageUrl}
						videoUrl={media.videoUrl}
						unoptimized={admin}
					/>
				</div>
				{/* Unmask curtain: sits over the already-painted poster, so the poster stays the LCP. */}
				<div
					aria-hidden="true"
					className="hero-strip-cover inset-0 bg-welcome-navy absolute"
				/>
			</div>

			<div className="bg-welcome-navy relative min-h-[28rem] overflow-hidden">
				<PatternMosaic
					colourway="navy"
					columns={4}
					rows={10}
					className="hero-pattern inset-0 absolute"
				/>
				{nextEvent && <HeroEventCard event={nextEvent} />}
			</div>
		</section>
	);
}
