import { Reveal } from "@shared/components/motion/Reveal";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import type { Colourway, TileKind } from "@shared/components/pattern/tiles";
import { useTranslations } from "next-intl";

const FEATURE_KEYS = ["stables", "pulse", "community"] as const;
const TONES = ["bg-ice-light", "bg-lilac-light", "bg-sage"];
const PANELS: { colourway: Colourway; kind: TileKind }[] = [
	{ colourway: "navy", kind: "ring" },
	{ colourway: "plum", kind: "submarkQuad" },
	{ colourway: "green", kind: "ring" },
];

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
								className={`card-lift min-h-96 relative flex flex-col overflow-hidden rounded-lg ${TONES[i]}`}
							>
								{/* Pattern panel: deals in on view; ring spurs turn on card hover. */}
								<div className="h-48 shrink-0 overflow-hidden">
									<PatternMosaic
										colourway={PANELS[i]?.colourway}
										kind={PANELS[i]?.kind}
										columns={4}
										rows={2}
										trigger="view"
									/>
								</div>
								<div className="gap-2.5 p-6 flex flex-col">
									<h3 className="type-display-md">
										{t(`features.${key}.title`)}
									</h3>
									<p className="text-ink-variant">
										{t(`features.${key}.description`)}
									</p>
								</div>
							</div>
						</Reveal>
					))}
				</div>
			</div>
		</section>
	);
}
