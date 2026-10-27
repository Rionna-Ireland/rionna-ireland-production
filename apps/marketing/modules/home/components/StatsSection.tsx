import { Reveal } from "@shared/components/motion/Reveal";

import { CountUp } from "./CountUp";

const TONES = [
	"bg-white text-ink",
	"bg-sage text-forest",
	"bg-lilac-light text-plum",
	"bg-ice-light text-ink",
];

export function StatsSection({ stats }: { stats: { value: string; label: string }[] }) {
	if (stats.length === 0) return null;
	return (
		<section className="bg-cream py-14 relative overflow-hidden">
			{/* Low-contrast pattern 3 under the tiles; fades in with the band. */}
			<Reveal className="texture-p3 inset-0 absolute [--texture-opacity:0.1]">{null}</Reveal>
			<div className="gap-4 md:grid-cols-4 relative container grid grid-cols-2">
				{stats.map((s, i) => (
					<CountUp
						key={`${s.label}-${i}`}
						value={s.value}
						label={s.label}
						delayMs={i * 120}
						className={`gap-1 p-6 pb-9 flex flex-col rounded-lg ${TONES[i % TONES.length]}`}
					/>
				))}
			</div>
		</section>
	);
}
