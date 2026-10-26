import { MaskedText } from "@shared/components/motion/MaskedText";
import { PinnedStage } from "@shared/components/motion/PinnedStage";
import { Reveal } from "@shared/components/motion/Reveal";
import { SectionLabel } from "@shared/components/motion/SectionLabel";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import Image from "next/image";
import type { CSSProperties } from "react";

import { type NewsTilePost, placeholderFor } from "./news-types";

// Position (% of stage), flight vector (vw / vh), depth (flies past the camera), size (rem).
const CARDS = [
	{ x: 6, y: 12, dx: -34, dy: -26, depth: 1.6, size: 12 },
	{ x: 74, y: 8, dx: 30, dy: -30, depth: 1.2, size: 10 },
	{ x: 82, y: 56, dx: 38, dy: 20, depth: 1.8, size: 13 },
	{ x: 4, y: 62, dx: -36, dy: 24, depth: 1.3, size: 11 },
	{ x: 34, y: 70, dx: -10, dy: 34, depth: 0.8, size: 8 },
	{ x: 56, y: 3, dx: 12, dy: -34, depth: 0.6, size: 7 },
];

/** The About opener's depth field, reused: the latest stories' photos drift past a huge masked headline. */
export function NewsOpener({
	index,
	label,
	title,
	intro,
	posts,
}: {
	index: number;
	label: string;
	title: string;
	intro: string;
	posts: NewsTilePost[];
}) {
	return (
		<section data-nav-tone="light">
			<PinnedStage
				heightSvh={220}
				stageClassName="grain bg-cream min-h-svh relative isolate flex items-center justify-center overflow-hidden"
			>
				{CARDS.map((c, i) => {
					const photo = posts[i]?.featuredImageUrl;
					const ph = placeholderFor(i);
					return (
						<div
							key={c.x}
							aria-hidden="true"
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
							{photo ? (
								<Image
									unoptimized
									src={photo}
									alt=""
									width={320}
									height={320}
									className="aspect-square size-full rounded-lg object-cover"
								/>
							) : (
								<PatternMosaic
									colourway={ph.colourway}
									kind={ph.kind}
									columns={1}
									rows={1}
									className="rounded-lg"
								/>
							)}
						</div>
					);
				})}
				<div className="ch-headline gap-6 px-6 relative z-10 flex w-full flex-col items-center text-center">
					<Reveal immediate>
						<SectionLabel index={index} label={label} />
					</Reveal>
					<MaskedText
						as="h1"
						immediate
						text={title}
						className="max-w-5xl text-ink font-display text-[clamp(4rem,14vw,12rem)] leading-[0.95] tracking-[-0.02em] text-balance"
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
		</section>
	);
}
