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
			<div className="grid grid-cols-1 @2xl:grid-cols-3 gap-4">
				{TILES.map((tile) => (
					<div
						key={tile.label}
						className="rounded-2xl bg-card p-6 shadow-sm flex flex-col gap-3"
					>
						<tile.Icon className="size-6 text-primary" strokeWidth={1.5} />
						<p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
							{tile.eyebrow}
						</p>
						<h3 className="font-display text-2xl text-foreground leading-tight">
							{tile.label}
						</h3>
						<p className="text-sm text-foreground/75 leading-relaxed">
							{tile.body}
						</p>
					</div>
				))}
			</div>
		</section>
	);
}
