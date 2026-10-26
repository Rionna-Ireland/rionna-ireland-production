import { AppStoreButtons } from "@app-showcase/components/AppStoreButtons";
import { type Feature, FeatureScroller } from "@app-showcase/components/FeatureScroller";
import { PhoneFrame } from "@app-showcase/components/PhoneFrame";
import { resolveStoreLinks } from "@app-showcase/lib/store-links";
import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { Reveal } from "@shared/components/motion/Reveal";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import { getClubOrganization } from "@shared/lib/club";
import { getSiteJoinCta } from "@shared/lib/website";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "appPage.meta" });
	return { title: t("title"), description: t("description") };
}

const shot = (name: string) => `/app-screens/${name}.webp`;

export default async function AppPage(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	setRequestLocale(locale);
	redirectIfWireframeMode(locale);

	const [t, tRoot, club, joinCta] = await Promise.all([
		getTranslations({ locale, namespace: "appPage" }),
		getTranslations({ locale }),
		getClubOrganization(),
		getSiteJoinCta(),
	]);
	const { ios, android } = resolveStoreLinks(club.metadata.appLinks);
	const badges = {
		ios,
		android,
		altIos: t("badges.ios"),
		altAndroid: t("badges.android"),
		comingSoon: t("badges.comingSoon"),
	};

	const screen = (file: string, key: string) => ({ src: shot(file), alt: t(`screens.${key}`) });
	const feature = (
		key: "stables" | "community" | "events" | "paddock",
		tint: string,
		screens: Feature["screens"],
	): Feature => ({
		key,
		label: t(`features.${key}.label`),
		title: t(`features.${key}.title`),
		body: t(`features.${key}.body`),
		tint,
		screens,
	});
	const features = [
		feature("stables", "var(--color-ice-light)", [
			screen("02-stables", "stables"),
			screen("03-horse", "horseDetail"),
		]),
		feature("community", "var(--color-lilac-light)", [screen("05-community", "communityFeed")]),
		feature("events", "var(--color-ice)", [screen("04-events", "events")]),
		feature("paddock", "var(--color-sage)", [
			screen("07-paddock", "paddock"),
			screen("08-charity", "paddockCharity"),
		]),
	];

	return (
		<>
			<section
				data-nav-tone="dark"
				data-hero-under-nav
				className="grain bg-welcome-navy text-white relative isolate overflow-hidden"
			>
				<PatternMosaic
					colourway="navy"
					columns={4}
					rows={10}
					className="lg:block inset-y-0 right-0 absolute hidden w-[34%] opacity-70"
				/>
				<div className="gap-12 pt-36 pb-16 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:pb-24 relative container grid">
					<div className="gap-6 flex flex-col items-start">
						<Reveal immediate>
							<span className="type-label text-lilac">{t("hero.eyebrow")}</span>
						</Reveal>
						<MaskedText
							immediate
							as="h1"
							text={t("hero.title")}
							className="font-display text-[clamp(3.25rem,8vw,7rem)] leading-[0.95] tracking-[-0.02em] text-balance"
						/>
						<Reveal immediate delayMs={200}>
							<p className="max-w-md text-lg text-white/80">{t("hero.subtitle")}</p>
						</Reveal>
						<Reveal immediate delayMs={300}>
							<AppStoreButtons tone="dark" {...badges} />
						</Reveal>
					</div>
					<Reveal immediate delayMs={400} className="mx-auto w-[min(18rem,70vw)]">
						<PhoneFrame
							priority
							src={shot("01-home")}
							alt={t("screens.home")}
							className="lg:rotate-3"
						/>
					</Reveal>
				</div>
			</section>

			<FeatureScroller features={features} />

			<section
				data-nav-tone="dark"
				className="grain bg-plum text-white relative isolate overflow-hidden"
			>
				<PatternMosaic
					colourway="plum"
					columns={12}
					rows={1}
					trigger="view"
					className="relative"
				/>
				<div className="gap-10 py-20 md:py-28 relative container flex flex-col items-start">
					<Reveal>
						<span className="type-label text-lilac">{t("closing.eyebrow")}</span>
					</Reveal>
					<MaskedText
						as="h2"
						text={t("closing.title")}
						className="font-display text-[clamp(2.75rem,7vw,6rem)] leading-[0.98] tracking-[-0.02em] text-balance"
					/>
					<Reveal delayMs={200} className="gap-8 flex flex-wrap items-center">
						<AppStoreButtons tone="dark" {...badges} />
						<JoinCtaLink
							cta={joinCta}
							className={`group ${v2Button({ variant: "onDark" })}`}
						>
							{joinCta.labelKey ? tRoot(joinCta.labelKey) : t("closing.cta")}
							<ArrowRightIcon className="ml-2 size-4 group-hover:translate-x-1 transition-transform duration-(--dur-hover)" />
						</JoinCtaLink>
					</Reveal>
				</div>
			</section>
		</>
	);
}
