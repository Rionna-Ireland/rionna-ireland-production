import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { v2Button } from "@shared/components/ui/v2";
import { getSiteJoinCta, getWebsiteContent } from "@shared/lib/website";
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
		<section className="py-14 container">
			<div className="bg-plum text-white relative overflow-hidden rounded-lg">
				<div className="bg-card-plum-glow inset-0 absolute" />
				<div className="gap-4 px-8 py-14 relative flex flex-col items-center text-center">
					<span className="type-label text-lilac">{t("eyebrow")}</span>
					<h2 className="type-display-lg text-balance">{t("title")}</h2>
					<p className="text-lg text-lilac-light">
						{price ?? tPlan("price")} {interval ?? tPlan("interval")}
						{note ? ` · ${note}` : ""}
					</p>
					<JoinCtaLink cta={joinCta} className={v2Button({ variant: "onDark" })}>
						{joinCta.labelKey ? tRoot(joinCta.labelKey) : t("cta")}
					</JoinCtaLink>
				</div>
			</div>
		</section>
	);
}
