import { config } from "@config";
import { WireframeMembership } from "@home/components/WireframeMembership";
import { pickItems } from "@shared/components/faq-items";
import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { MembershipFaq } from "@shared/components/MembershipFaq";
import { InViewStage } from "@shared/components/motion/InViewStage";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { Reveal } from "@shared/components/motion/Reveal";
import { SectionLabel } from "@shared/components/motion/SectionLabel";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import { getSiteJoinCta, getWebsiteContent } from "@shared/lib/website";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { CSSProperties } from "react";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "membership.meta" });
	return {
		title: t("title"),
		description: t("description"),
	};
}

const FEATURE_KEYS = [
	"stables",
	"liveRaceData",
	"community",
	"pushAlerts",
	"trainerUpdates",
	"exclusiveNews",
] as const;

const FAQ_KEYS = ["whatIncluded", "howToCancel", "tierChanges", "appSupport"] as const;

export default async function MembershipPage(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	setRequestLocale(locale);

	if (config.wireframeMode) {
		return <WireframeMembership />;
	}

	const [t, tRoot, joinCta, { content }] = await Promise.all([
		getTranslations({ locale, namespace: "membership" }),
		getTranslations({ locale }),
		getSiteJoinCta(),
		getWebsiteContent(),
	]);
	const { membership } = content;

	const inclusions = pickItems(membership.inclusions, () =>
		FEATURE_KEYS.map((key) => t(`plan.features.${key}`)),
	);
	const faq = pickItems(membership.faq, () =>
		FAQ_KEYS.map((key) => ({
			question: t(`faq.items.${key}.question`),
			answer: t(`faq.items.${key}.answer`),
		})),
	);

	return (
		<div>
			<section
				data-nav-tone="dark"
				data-hero-under-nav
				className="grain bg-plum text-white relative isolate overflow-hidden"
			>
				<PatternMosaic
					colourway="plum"
					columns={4}
					rows={10}
					className="lg:block inset-y-0 right-0 absolute hidden w-[28%] opacity-70"
				/>
				<div className="gap-6 pt-40 pb-40 relative container flex flex-col items-start">
					<Reveal immediate>
						<SectionLabel index={1} label={t("eyebrow")} className="text-lilac" />
					</Reveal>
					<MaskedText
						immediate
						as="h1"
						text={t("title")}
						className="font-display text-[clamp(3.25rem,8vw,7rem)] leading-[0.95] tracking-[-0.02em] text-balance"
					/>
					<Reveal immediate delayMs={200}>
						<p className="max-w-xl text-lg text-white/80">{t("description")}</p>
					</Reveal>
				</div>
			</section>

			<section className="pb-20 bg-page relative">
				<div className="-mt-28 relative container">
					<InViewStage className="ticket max-w-xl text-white mx-auto">
						<div className="bg-welcome-navy p-8 md:p-10 gap-3 flex flex-col rounded-t-lg">
							<span className="type-label text-lilac">{t("plan.title")}</span>
							<div className="gap-3 flex flex-wrap items-baseline">
								<span className="font-display text-[clamp(4rem,10vw,6rem)] leading-none">
									{membership.price ?? t("plan.price")}
								</span>
								<span className="type-label text-white/70">
									{membership.interval ?? t("plan.interval")}
								</span>
							</div>
							<p className="type-label text-white/60">
								{membership.note ?? t("plan.priceNote")}
							</p>
						</div>
						<div className="ticket-perf bg-welcome-navy" aria-hidden="true" />
						<div className="bg-welcome-navy p-8 md:p-10 rounded-b-lg">
							<ul className="gap-3 grid">
								{inclusions.map((item, i) => (
									<li key={`${item}-${i}`} className="gap-3 flex items-start">
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden="true"
											className="draw-check mt-0.5 size-5 text-lilac shrink-0"
											style={{ "--i": i } as CSSProperties}
										>
											<path d="M4 12.5l5 5L20 6.5" pathLength={1} />
										</svg>
										<span className="text-white/90">{item}</span>
									</li>
								))}
							</ul>
							<div className="mt-8">
								<JoinCtaLink
									cta={joinCta}
									className={v2Button({ variant: "onDark" })}
								>
									{joinCta.labelKey ? tRoot(joinCta.labelKey) : t("plan.cta")}
									<ArrowRightIcon className="ticket-arrow ml-2 size-4" />
								</JoinCtaLink>
							</div>
						</div>
					</InViewStage>
				</div>
			</section>

			<section
				id="faq"
				data-nav-tone="light"
				className="py-20 md:py-28 bg-cream scroll-mt-28"
			>
				<div className="container">
					<MembershipFaq items={faq} title={t("faq.title")} />
				</div>
			</section>
		</div>
	);
}
