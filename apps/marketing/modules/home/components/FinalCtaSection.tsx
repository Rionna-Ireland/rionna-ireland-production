import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { Reveal } from "@shared/components/motion/Reveal";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import { getSiteJoinCta, getWebsiteContent } from "@shared/lib/website";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function FinalCtaSection() {
	const [t, tRoot, tPlan, { content }, joinCta] = await Promise.all([
		getTranslations("home.finalCta"),
		getTranslations(),
		getTranslations("membership.plan"),
		getWebsiteContent(),
		getSiteJoinCta(),
	]);
	const { price, interval, note } = content.membership;

	return (
		<section
			data-nav-tone="dark"
			className="grain bg-plum text-white relative isolate overflow-hidden"
		>
			<div className="bg-card-plum-glow inset-0 absolute" />
			<PatternMosaic
				colourway="plum"
				columns={12}
				rows={1}
				trigger="view"
				className="relative"
			/>
			<div className="gap-10 py-20 md:py-28 md:grid-cols-[1.5fr_1fr] md:items-end relative container grid">
				<div className="gap-5 flex flex-col">
					<Reveal>
						<span className="type-label text-lilac">{t("eyebrow")}</span>
					</Reveal>
					<MaskedText
						as="h2"
						text={t("title")}
						className="font-display text-[clamp(2.75rem,7vw,6rem)] leading-[0.98] tracking-[-0.02em] text-balance"
					/>
				</div>
				<Reveal delayMs={200} className="gap-5 flex flex-col items-start">
					<p className="text-lg text-lilac-light">
						{price ?? tPlan("price")} {interval ?? tPlan("interval")}
						{note ? ` · ${note}` : ""}
					</p>
					<JoinCtaLink
						cta={joinCta}
						className={`group ${v2Button({ variant: "onDark" })}`}
					>
						{joinCta.labelKey ? tRoot(joinCta.labelKey) : t("cta")}
						<ArrowRightIcon className="ml-2 size-4 group-hover:translate-x-1 transition-transform duration-(--dur-hover)" />
					</JoinCtaLink>
				</Reveal>
			</div>
		</section>
	);
}
