import { SectionLabel } from "@shared/components/motion/SectionLabel";
import type { CSSProperties } from "react";

export type ValueCard = { key: string; eyebrow: string; title: string; description: string };

const SKINS = [
	"bg-ink text-white texture-p3 [--texture-opacity:0.25]",
	"bg-sage text-forest texture-p8 [--texture-opacity:0.5]",
	"bg-plum text-white texture-p1 [--texture-opacity:0.3]",
] as const;

/** Cards that stack as you scroll (CSS sticky; normal flow under Reduce Motion). */
export function Values({
	cards,
	label,
	index,
}: {
	cards: ValueCard[];
	label: string;
	index: number;
}) {
	return (
		<section id="believe" data-chapter data-nav-tone="light" className="py-20 bg-page">
			<div className="gap-10 container flex flex-col">
				<SectionLabel index={index} label={label} />
				<div className="gap-6 flex flex-col">
					{cards.map((c, i) => (
						<article
							key={c.key}
							className={`stack-card grain gap-4 p-8 md:p-14 relative isolate flex flex-col justify-end overflow-hidden rounded-xl ${SKINS[i % SKINS.length]}`}
							style={{ "--i": i } as CSSProperties}
						>
							<span className="type-label opacity-70">{c.eyebrow}</span>
							<h3 className="max-w-3xl font-display text-[clamp(2rem,5vw,4rem)] leading-none tracking-[-0.015em]">
								{c.title}
							</h3>
							<p className="max-w-xl text-lg opacity-80">{c.description}</p>
						</article>
					))}
				</div>
			</div>
		</section>
	);
}
