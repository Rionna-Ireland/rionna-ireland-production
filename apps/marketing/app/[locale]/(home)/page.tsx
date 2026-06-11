import { config } from "@config";
import { FeaturesSection } from "@home/components/FeaturesSection";
import { FinalCtaSection } from "@home/components/FinalCtaSection";
import { HeroSection } from "@home/components/HeroSection";
import { HorsePreviewSection } from "@home/components/HorsePreviewSection";
import { NewsPreviewSection } from "@home/components/NewsPreviewSection";
import { WireframeHome } from "@home/components/WireframeHome";
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
			<HorsePreviewSection />
			<FeaturesSection />
			<NewsPreviewSection />
			<FinalCtaSection />
		</>
	);
}
