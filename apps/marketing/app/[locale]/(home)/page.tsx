import { config } from "@config";
import { AboutTeaserSection } from "@home/components/AboutTeaserSection";
import { Arrival } from "@home/components/Arrival";
import { FeaturesSection } from "@home/components/FeaturesSection";
import { FinalCtaSection } from "@home/components/FinalCtaSection";
import { HeroSection } from "@home/components/HeroSection";
import { HorsePreviewSection } from "@home/components/HorsePreviewSection";
import { StatsSection } from "@home/components/StatsSection";
import { isWaitlistView } from "@shared/lib/waitlist-view";
import { getWebsiteContent } from "@shared/lib/website";
import { WaitlistLanding } from "@waitlist/components/WaitlistLanding";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	setRequestLocale(locale);

	// S12-09 / D39: until launch the waitlist is the whole site.
	if ((await isWaitlistView()) || config.wireframeMode) {
		return <WaitlistLanding />;
	}

	const [{ content }, t] = await Promise.all([
		getWebsiteContent(),
		getTranslations("home.arrival"),
	]);

	return (
		<>
			<Arrival tagline={t("tagline")} />
			{/* Curtain: the hero sticks (lg, motion allowed) while .home-flow slides up over it. */}
			<div className="home-hero">
				<HeroSection />
			</div>
			<div data-nav-tone="light" className="home-flow">
				<HorsePreviewSection />
				<StatsSection stats={content.stats} />
				<AboutTeaserSection />
				<FeaturesSection />
				<FinalCtaSection />
			</div>
		</>
	);
}
