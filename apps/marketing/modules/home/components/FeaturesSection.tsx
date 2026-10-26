import { Reveal } from "@shared/components/motion/Reveal";
import { type Colourway, PatternTile } from "@shared/components/pattern/tiles";
import { useTranslations } from "next-intl";

const FEATURE_KEYS = ["stables", "pulse", "community"] as const;
const TONES = ["bg-ice-light", "bg-lilac-light", "bg-sage"];
const CORNERS: Colourway[] = ["navy", "plum", "green"];

export function FeaturesSection() {
	const t = useTranslations("home");

	return (
		<section id="features" className="bg-cream py-20 md:py-28">
			<div className="gap-8 container flex flex-col">
				<Reveal>
					<span className="type-label text-ink-variant">{t("whyJoin.eyebrow")}</span>
				</Reveal>
				<div className="gap-4 md:grid-cols-3 grid items-start">
					{FEATURE_KEYS.map((key, i) => (
						<Reveal key={key} delayMs={i * 80} className={i === 1 ? "md:mt-12" : ""}>
							<div
								className={`card-lift gap-2.5 p-6 pt-28 min-h-80 relative flex flex-col overflow-hidden rounded-lg ${TONES[i]}`}
							>
								{/* Ring tile corner: its spurs turn when the card is hovered. */}
								<div
									aria-hidden="true"
									className="tile-corner top-0 right-0 size-24 absolute"
								>
									<PatternTile
										spec={{
											kind: "ring",
											colourway: CORNERS[i] ?? "navy",
											turn: 0,
										}}
									/>
								</div>
								<h3 className="type-display-md">{t(`features.${key}.title`)}</h3>
								<p className="text-ink-variant">
									{t(`features.${key}.description`)}
								</p>
							</div>
						</Reveal>
					))}
				</div>
			</div>
		</section>
	);
}
