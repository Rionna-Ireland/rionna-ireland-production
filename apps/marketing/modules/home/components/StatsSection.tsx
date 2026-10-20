const TONES = [
	"bg-cream text-ink",
	"bg-sage text-forest",
	"bg-lilac-light text-plum",
	"bg-ice-light text-ink",
];

export function StatsSection({ stats }: { stats: { value: string; label: string }[] }) {
	if (stats.length === 0) return null;
	return (
		<section className="py-6 container">
			<div className="gap-4 md:grid-cols-4 grid grid-cols-2">
				{stats.map((s, i) => (
					<div
						key={`${s.label}-${i}`}
						className={`gap-1 p-6 flex flex-col rounded-lg ${TONES[i % TONES.length]}`}
					>
						<span className="type-display-lg">{s.value}</span>
						<span className="text-sm opacity-80">{s.label}</span>
					</div>
				))}
			</div>
		</section>
	);
}
