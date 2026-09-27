import { config } from "@config";
import { FeaturesSection } from "@home/components/FeaturesSection";
import { FinalCtaSection } from "@home/components/FinalCtaSection";
import { HeroSection } from "@home/components/HeroSection";
import { HorsePreviewSection } from "@home/components/HorsePreviewSection";
import { NewsPreviewSection } from "@home/components/NewsPreviewSection";
import { WireframeHome } from "@home/components/WireframeHome";
import { isPublicSignupOpen } from "@repo/utils";
import { WaitlistSection } from "@waitlist/components/WaitlistSection";
import { setRequestLocale } from "next-intl/server";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	setRequestLocale(locale);

	if (config.wireframeMode) {
		return <WireframeHome />;
	}

	return (
		<>
			<HeroSection />
			{/* S12-09 / D39: capture emails on the full home while signup is closed. */}
			{!isPublicSignupOpen() && <WaitlistSection id="waitlist" />}
			<HorsePreviewSection />
			<FeaturesSection />
			<NewsPreviewSection />
			<FinalCtaSection />
		</>
	);
}
