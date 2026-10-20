import { useTranslations } from "next-intl";

const FEATURE_KEYS = ["stables", "pulse", "community"] as const;
const TONES = ["bg-ice-light", "bg-lilac-light", "bg-sage"];

export function FeaturesSection() {
	const t = useTranslations("home");

	return (
		<section id="features" className="bg-cream py-14">
			<div className="gap-6 container flex flex-col">
				<span className="type-label text-ink-variant">{t("whyJoin.eyebrow")}</span>
				<div className="gap-4 md:grid-cols-3 grid">
					{FEATURE_KEYS.map((key, i) => (
						<div
							key={key}
							className={`gap-2.5 p-6 flex flex-col rounded-lg ${TONES[i]}`}
						>
							<h3 className="type-display-md">{t(`features.${key}.title`)}</h3>
							<p className="text-ink-variant">{t(`features.${key}.description`)}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
