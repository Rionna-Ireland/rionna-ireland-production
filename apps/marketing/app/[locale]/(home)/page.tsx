import { config } from "@config";
import { FeaturesSection } from "@home/components/FeaturesSection";
import { FinalCtaSection } from "@home/components/FinalCtaSection";
import { HeroSection } from "@home/components/HeroSection";
import { HorsePreviewSection } from "@home/components/HorsePreviewSection";
import { NewsPreviewSection } from "@home/components/NewsPreviewSection";
import { isWaitlistOnly } from "@shared/lib/waitlist-mode";
import { WaitlistLanding } from "@waitlist/components/WaitlistLanding";
import { setRequestLocale } from "next-intl/server";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	setRequestLocale(locale);

	// S12-09 / D39: until launch the waitlist is the whole site.
	if (isWaitlistOnly() || config.wireframeMode) {
		return <WaitlistLanding />;
	}

	return (
		<>
			<HeroSection />
			<HorsePreviewSection />
			<FeaturesSection />
			<NewsPreviewSection />
			<FinalCtaSection />
		</>
	);
}
