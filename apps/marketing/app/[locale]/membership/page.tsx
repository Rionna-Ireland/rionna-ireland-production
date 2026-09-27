import { config } from "@config";
import { WireframeMembership } from "@home/components/WireframeMembership";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@repo/ui/components/accordion";
import { Button } from "@repo/ui/components/button";
import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { getJoinCta } from "@shared/lib/join-url";
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

	const t = await getTranslations({ locale, namespace: "membership" });

	const tRoot = await getTranslations({ locale });
	const joinCta = getJoinCta();

	return (
		<div className="py-16 md:py-24 container">
			<div className="max-w-3xl">
				<span className="text-xs font-mono tracking-[0.22em] text-foreground/70 uppercase">
					{t("eyebrow")}
				</span>
				<h1 className="mt-4 font-medium text-5xl md:text-6xl lg:text-7xl leading-tight font-display">
					{t("title")}
				</h1>
				<p className="mt-6 text-lg md:text-xl leading-relaxed text-foreground/70">
					{t("description")}
				</p>
			</div>

			<div className="mt-16 gap-10 lg:grid-cols-[1.2fr_1fr] grid">
				<div className="p-8 md:p-10 rounded-3xl bg-[#EEEADF] dark:bg-[#172741]">
					<h2 className="font-medium text-3xl md:text-4xl font-display">
						{t("plan.title")}
					</h2>
					<div className="mt-4 gap-2 flex items-baseline">
						<span className="font-medium text-5xl md:text-6xl font-display">
							{t("plan.price")}
						</span>
						<span className="text-xs font-mono tracking-[0.2em] text-foreground/60 uppercase">
							{t("plan.interval")}
						</span>
					</div>
					<p className="mt-3 text-foreground/70">{t("plan.priceNote")}</p>

					<ul className="mt-8 gap-3 grid">
						{FEATURE_KEYS.map((key) => (
							<li key={key} className="gap-3 flex items-start">
								<CheckIcon className="mt-0.5 size-5 shrink-0 text-foreground" />
								<span className="text-foreground/90">
									{t(`plan.features.${key}`)}
								</span>
							</li>
						))}
					</ul>

					<div className="mt-10">
						<Button size="lg" variant="primary" asChild className="sm:w-auto w-full">
							<JoinCtaLink cta={joinCta}>
								{joinCta.labelKey ? tRoot(joinCta.labelKey) : t("plan.cta")}
								<ArrowRightIcon className="ml-2 size-4" />
							</JoinCtaLink>
						</Button>
					</div>
				</div>

				<div>
					<h2 className="font-medium text-3xl md:text-4xl font-display">
						{t("faq.title")}
					</h2>
					<Accordion type="single" collapsible className="mt-6">
						{FAQ_KEYS.map((key) => (
							<AccordionItem key={key} value={key}>
								<AccordionTrigger className="font-medium text-left">
									{t(`faq.items.${key}.question`)}
								</AccordionTrigger>
								<AccordionContent className="text-foreground/70">
									{t(`faq.items.${key}.answer`)}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</div>
		</div>
	);
}
