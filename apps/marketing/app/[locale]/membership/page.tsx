import { config } from "@config";
import { WireframeMembership } from "@home/components/WireframeMembership";
import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { MembershipFaq, pickItems } from "@shared/components/MembershipFaq";
import { v2Button } from "@shared/components/ui/v2";
import { getSiteJoinCta, getWebsiteContent } from "@shared/lib/website";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "membership" });
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
		<div className="bg-page">
			<section className="gap-3 py-12 container flex flex-col items-center text-center">
				<span className="type-label text-plum">{t("eyebrow")}</span>
				<h1 className="type-display-lg text-balance">{t("title")}</h1>
				<p className="max-w-xl text-lg text-ink-variant">{t("description")}</p>
			</section>

			<section className="gap-10 pb-16 lg:grid-cols-[1.15fr_1fr] container grid">
				<div className="bg-welcome-navy p-8 md:p-10 gap-4 text-white flex flex-col rounded-lg">
					<span className="type-label text-lilac">{t("plan.title")}</span>
					<div className="gap-2 flex flex-wrap items-baseline">
						<span className="type-display-lg">
							{membership.price ?? t("plan.price")}
						</span>
						<span className="type-label text-white/70">
							{membership.interval ?? t("plan.interval")}
						</span>
					</div>
					<p className="text-sm text-white/70">
						{membership.note ?? t("plan.priceNote")}
					</p>
					<ul className="mt-4 gap-3 grid">
						{inclusions.map((item, i) => (
							<li key={`${item}-${i}`} className="gap-3 flex items-start">
								<CheckIcon className="mt-0.5 size-5 text-lilac shrink-0" />
								<span className="text-white/90">{item}</span>
							</li>
						))}
					</ul>
					<div className="mt-6">
						<JoinCtaLink cta={joinCta} className={v2Button({ variant: "onDark" })}>
							{joinCta.labelKey ? tRoot(joinCta.labelKey) : t("plan.cta")}
							<ArrowRightIcon className="ml-2 size-4" />
						</JoinCtaLink>
					</div>
				</div>

				<div>
					<h2 className="type-display-md">{t("faq.title")}</h2>
					<MembershipFaq items={faq} />
				</div>
			</section>
		</div>
	);
}
