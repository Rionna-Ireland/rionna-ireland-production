import { Activity, Trophy, Users, type LucideIcon } from "lucide-react";

interface Tile {
	eyebrow: string;
	label: string;
	body: string;
	Icon: LucideIcon;
}

const TILES: Tile[] = [
	{
		eyebrow: "STABLES",
		label: "Our Stables",
		body: "Follow your horses: trainer updates, race declarations, results, and behind-the-scenes media.",
		Icon: Trophy,
	},
	{
		eyebrow: "PULSE",
		label: "Pulse",
		body: "Your daily club feed: news, member announcements, and what's coming up next.",
		Icon: Activity,
	},
	{
		eyebrow: "COMMUNITY",
		label: "Community",
		body: "Talk with other members, ask trainers questions, and follow the charity work.",
		Icon: Users,
	},
];

export function WhatsInTheAppStrip() {
	return (
		<section className="@container">
			<div className="@2xl:grid-cols-3 gap-4 grid grid-cols-1">
				{TILES.map((tile) => (
					<div
						key={tile.label}
						className="p-6 gap-3 flex flex-col rounded-xl border bg-card"
					>
						<tile.Icon className="size-6 text-primary" strokeWidth={1.5} />
						<p className="text-xs tracking-wider font-mono text-muted-foreground uppercase">
							{tile.eyebrow}
						</p>
						<h3 className="text-2xl leading-tight font-display text-foreground">
							{tile.label}
						</h3>
						<p className="text-sm leading-relaxed text-foreground/75">{tile.body}</p>
					</div>
				))}
			</div>
		</section>
	);
}
