import type { CSSProperties } from "react";

import { PatternMosaic } from "./PatternMosaic";
import type { Colourway, TileKind } from "./tiles";

export const CYCLE_PATTERNS: { kind: TileKind; colourway: Colourway }[] = [
	{ kind: "quad", colourway: "navy" },
	{ kind: "submarkQuad", colourway: "lilac" },
	{ kind: "harlequin", colourway: "plum" },
	{ kind: "ring", colourway: "green" },
];

/**
 * Stacked pattern panels that crossfade in turn (CSS only, see `.cyc-layer`).
 * The first pattern is the static state; the loop runs under `[data-playing]`.
 */
export function PatternCycle({
	patterns = CYCLE_PATTERNS,
	className,
}: {
	patterns?: { kind: TileKind; colourway: Colourway }[];
	className?: string;
}) {
	return (
		<div aria-hidden="true" className={`cyc ${className ?? ""}`}>
			{patterns.map((p, i) => (
				<div
					key={`${p.kind}:${p.colourway}`}
					className="cyc-layer"
					style={{ "--k": i, "--n": patterns.length } as CSSProperties}
				>
					<PatternMosaic colourway={p.colourway} kind={p.kind} columns={4} rows={9} />
				</div>
			))}
		</div>
	);
}
