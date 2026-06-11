import { config } from "@config";
import { WireframeMembership } from "@home/components/WireframeMembership";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@repo/ui/components/accordion";
import { Button } from "@repo/ui/components/button";
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

	const signupUrl = config.saasUrl
		? `${String(config.saasUrl).replace(/\/$/, "")}/signup`
		: "#";

	return (
		<div className="container py-16 md:py-24">
			<div className="max-w-3xl">
				<span className="font-mono text-xs tracking-[0.22em] uppercase text-foreground/70">
					{t("eyebrow")}
				</span>
				<h1 className="mt-4 font-display font-medium text-5xl md:text-6xl lg:text-7xl leading-tight">
					{t("title")}
				</h1>
				<p className="mt-6 text-lg md:text-xl text-foreground/70 leading-relaxed">
					{t("description")}
				</p>
			</div>

			<div className="mt-16 gap-10 lg:grid-cols-[1.2fr_1fr] grid">
				<div className="rounded-3xl p-8 md:p-10 bg-[#EEEADF] dark:bg-[#172741]">
					<h2 className="font-display font-medium text-3xl md:text-4xl">
						{t("plan.title")}
					</h2>
					<div className="mt-4 flex items-baseline gap-2">
						<span className="font-display font-medium text-5xl md:text-6xl">
							{t("plan.price")}
						</span>
						<span className="font-mono text-xs tracking-[0.2em] uppercase text-foreground/60">
							{t("plan.interval")}
						</span>
					</div>
					<p className="mt-3 text-foreground/70">{t("plan.priceNote")}</p>

					<ul className="mt-8 gap-3 grid">
						{FEATURE_KEYS.map((key) => (
							<li key={key} className="flex items-start gap-3">
								<CheckIcon className="mt-0.5 size-5 shrink-0 text-foreground" />
								<span className="text-foreground/90">{t(`plan.features.${key}`)}</span>
							</li>
						))}
					</ul>

					<div className="mt-10">
						<Button size="lg" variant="primary" asChild className="w-full sm:w-auto">
							<a href={signupUrl}>
								{t("plan.cta")}
								<ArrowRightIcon className="ml-2 size-4" />
							</a>
						</Button>
					</div>
				</div>

				<div>
					<h2 className="font-display font-medium text-3xl md:text-4xl">
						{t("faq.title")}
					</h2>
					<Accordion type="single" collapsible className="mt-6">
						{FAQ_KEYS.map((key) => (
							<AccordionItem key={key} value={key}>
								<AccordionTrigger className="text-left font-medium">
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
