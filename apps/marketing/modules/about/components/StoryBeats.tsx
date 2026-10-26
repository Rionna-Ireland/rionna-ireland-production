import { PinnedStage } from "@shared/components/motion/PinnedStage";
import { SectionLabel } from "@shared/components/motion/SectionLabel";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import type { Colourway, TileKind } from "@shared/components/pattern/tiles";
import type { CSSProperties } from "react";

const CHIPS: { colourway: Colourway; kind: TileKind }[] = [
	{ colourway: "plum", kind: "harlequin" },
	{ colourway: "navy", kind: "quad" },
	{ colourway: "green", kind: "ring" },
	{ colourway: "lilac", kind: "gem" },
];

const KEY_WORDS = 2;

export function splitBeats(text: string): string[] {
	return text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean);
}

/** One pinned beat per paragraph; words fill ink-muted to ink, a pattern chip follows the key phrase. */
export function StoryBeats({ text, label, index }: { text: string; label: string; index: number }) {
	const beats = splitBeats(text);
	return (
		<section id="why" data-chapter data-nav-tone="light" className="bg-cream">
			{beats.map((beat, b) => {
				const words = beat.split(/\s+/);
				const chip = CHIPS[b % CHIPS.length];
				return (
					<PinnedStage
						// biome-ignore lint/suspicious/noArrayIndexKey: static paragraphs
						key={b}
						heightSvh={170}
						stageClassName="relative flex min-h-[60svh] items-center justify-center px-6 py-20"
					>
						<div className="beat gap-8 max-w-4xl flex flex-col items-start">
							{b === 0 && <SectionLabel index={index} label={label} />}
							<div className="text-ink font-display text-[clamp(1.5rem,3.2vw,2.75rem)] leading-[1.15] tracking-[-0.01em]">
								{words.map((word, i) => (
									<span
										// biome-ignore lint/suspicious/noArrayIndexKey: static word list
										key={`${i}:${word}`}
									>
										<span
											className="beat-word"
											style={
												{ "--w": (i / words.length) * 55 } as CSSProperties
											}
										>
											{word}
										</span>{" "}
										{i === KEY_WORDS - 1 && chip && (
											<span className="chip" aria-hidden="true">
												<PatternMosaic
													colourway={chip.colourway}
													kind={chip.kind}
													columns={1}
													rows={1}
													trigger="view"
												/>
											</span>
										)}
									</span>
								))}
							</div>
						</div>
					</PinnedStage>
				);
			})}
		</section>
	);
}
