"use client";

import { cn } from "@repo/ui";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { useInView } from "../motion/useInView";
import { type Colourway, type TileKind, CELEBRATION_TILE, PatternTile, QUILT_TILE } from "./tiles";

/** Fired by WaitlistForm on a successful join: the quilt's spurs light up. */
export const WAITLIST_JOINED_EVENT = "rionna:waitlist-joined";

/** Tiles settle in from the top-left corner, diagonal by diagonal (stepMs = --step-deal). */
export function dealDelay(index: number, columns: number, stepMs = 90): number {
	return ((index % columns) + Math.floor(index / columns)) * stepMs;
}

/**
 * S12-09: the "pattern cells" quilt beside the waitlist form: one pattern
 * (QUILT_TILE) repeated into one continuous surface. Motion is only the
 * load-in wave, a CSS spur turn on hover, and, when someone joins, the same
 * wave again as the spurs light ice blue. No ambient motion. Decorative only
 * (aria-hidden); reduced motion is handled in globals.css.
 */
export function PatternMosaic({
	className,
	colourway,
	kind = "harlequin",
	columns = 4,
	rows = 8,
	trigger = "load",
	observe = true,
}: {
	className?: string;
	/** Harlequin colourway; default is the waitlist quilt. */
	colourway?: Colourway;
	/** Tile kind when a colourway is set. */
	kind?: TileKind;
	columns?: number;
	rows?: number;
	/** "view" holds the deal until the mosaic scrolls into view. */
	trigger?: "load" | "view";
	/** false: no IntersectionObserver (only valid with trigger="load"). */
	observe?: boolean;
}) {
	const [joined, setJoined] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const noRef = useRef<HTMLDivElement>(null);
	const inView = useInView(observe ? ref : noRef);
	const waiting = trigger === "view" && !inView;
	const tile = colourway
		? ({ kind, colourway, turn: 0 } as const)
		: joined
			? CELEBRATION_TILE
			: QUILT_TILE;

	useEffect(() => {
		const onJoined = () => setJoined(true);
		window.addEventListener(WAITLIST_JOINED_EVENT, onJoined);
		return () => window.removeEventListener(WAITLIST_JOINED_EVENT, onJoined);
	}, []);

	return (
		<div
			ref={ref}
			aria-hidden="true"
			className={cn(
				"grid",
				columns === 4 && "grid-cols-4",
				"content-start overflow-hidden",
				className,
			)}
			style={
				columns === 4
					? undefined
					: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
			}
		>
			{Array.from({ length: columns * rows }, (_, index) => ({
				id: `slot-${index}`,
				delayMs: dealDelay(index, columns),
			})).map((slot) => (
				<div key={slot.id} className="pc-slot aspect-square">
					{/* Keyed on `joined` so the wave replays when someone joins. */}
					<div
						key={joined ? "joined" : "initial"}
						className={cn("pc-face size-full", waiting && "pc-wait")}
						style={{ "--delay": `${slot.delayMs}ms` } as CSSProperties}
					>
						<PatternTile spec={tile} />
					</div>
				</div>
			))}
		</div>
	);
}
