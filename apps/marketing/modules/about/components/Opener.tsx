import { MaskedText } from "@shared/components/motion/MaskedText";
import { PinnedStage } from "@shared/components/motion/PinnedStage";
import { PlayWhenVisible } from "@shared/components/motion/PlayWhenVisible";
import { Reveal } from "@shared/components/motion/Reveal";
import { SectionLabel } from "@shared/components/motion/SectionLabel";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import type { Colourway, TileKind } from "@shared/components/pattern/tiles";
import Image from "next/image";
import type { CSSProperties } from "react";

// Position (% of stage), flight vector (vw / vh), depth (flies past the camera at its scale), size (rem).
const CARDS: {
	x: number;
	y: number;
	dx: number;
	dy: number;
	depth: number;
	size: number;
	colourway: Colourway;
	kind: TileKind;
	/** Colourway this card crossfades to now and then. */
	alt?: Colourway;
}[] = [
	{
		x: 6,
		y: 12,
		dx: -34,
		dy: -26,
		depth: 1.6,
		size: 12,
		colourway: "navy",
		kind: "quad",
		alt: "lilac",
	},
	{
		x: 74,
		y: 8,
		dx: 30,
		dy: -30,
		depth: 1.2,
		size: 10,
		colourway: "lilac",
		kind: "ring",
		alt: "plum",
	},
	{
		x: 82,
		y: 56,
		dx: 38,
		dy: 20,
		depth: 1.8,
		size: 13,
		colourway: "plum",
		kind: "harlequin",
		alt: "green",
	},
	{
		x: 4,
		y: 62,
		dx: -36,
		dy: 24,
		depth: 1.3,
		size: 11,
		colourway: "green",
		kind: "halfDrop",
		alt: "navy",
	},
	{
		x: 30,
		y: 4,
		dx: -10,
		dy: -34,
		depth: 0.7,
		size: 7,
		colourway: "sageTint",
		kind: "submarkQuad",
	},
	{
		x: 60,
		y: 72,
		dx: 12,
		dy: 32,
		depth: 0.8,
		size: 8,
		colourway: "iceTint",
		kind: "gem",
		alt: "sageTint",
	},
	{
		x: 18,
		y: 78,
		dx: -18,
		dy: 30,
		depth: 0.6,
		size: 7,
		colourway: "pinkTint",
		kind: "submarkQuad",
	},
	{ x: 48, y: 2, dx: 14, dy: -34, depth: 0.5, size: 6, colourway: "cream", kind: "quad" },
];

export function Opener({
	label,
	index,
	title,
	intro,
	photoUrl,
}: {
	label: string;
	index: number;
	title: string;
	intro: string;
	photoUrl?: string | null;
}) {
	return (
		<PlayWhenVisible id="story" data-chapter data-nav-tone="light">
			<PinnedStage
				heightSvh={220}
				stageClassName="grain bg-cream min-h-svh relative isolate flex items-center justify-center overflow-hidden"
			>
				{CARDS.map((c, i) => (
					<div
						key={i}
						className={`ch-card ${i > 3 ? "max-md:hidden" : ""} ${c.depth > 1 ? "z-20" : "z-0"}`}
						style={
							{
								left: `${c.x}%`,
								top: `${c.y}%`,
								"--s": `${c.size}rem`,
								"--dx": c.dx,
								"--dy": c.dy,
								"--depth": c.depth,
							} as CSSProperties
						}
					>
						<div
							className="ch-bob relative size-full"
							style={{ "--k": i } as CSSProperties}
						>
							{i === 0 && photoUrl ? (
								<Image
									unoptimized
									src={photoUrl}
									alt=""
									width={320}
									height={320}
									className="aspect-square size-full rounded-lg object-cover"
								/>
							) : (
								<>
									<PatternMosaic
										colourway={c.colourway}
										kind={c.kind}
										columns={1}
										rows={1}
										className="rounded-lg"
									/>
									{c.alt && (
										<PatternMosaic
											colourway={c.alt}
											kind={c.kind}
											columns={1}
											rows={1}
											className="ch-swap inset-0 absolute rounded-lg"
										/>
									)}
								</>
							)}
						</div>
					</div>
				))}
				<div className="ch-headline gap-6 px-6 relative z-10 flex w-full flex-col items-center text-center">
					<SectionLabel index={index} label={label} />
					<MaskedText
						as="h1"
						text={title}
						className="ch-title max-w-5xl text-ink font-display text-[clamp(3rem,9vw,8.5rem)] leading-[0.95] tracking-[-0.02em] text-balance"
					/>
					<Reveal
						immediate
						delayMs={500}
						className="max-w-xl text-ink/70 text-lg text-pretty"
					>
						<p>{intro}</p>
					</Reveal>
				</div>
				<span
					aria-hidden="true"
					className="ch-rule bg-ink bottom-0 absolute left-1/2 h-[18svh] w-px"
				/>
			</PinnedStage>
		</PlayWhenVisible>
	);
}
