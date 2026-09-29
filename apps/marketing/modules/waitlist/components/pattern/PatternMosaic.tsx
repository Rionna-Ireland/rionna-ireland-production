"use client";

import { cn } from "@repo/ui";
import { type CSSProperties, useEffect, useState } from "react";

import { CELEBRATION_TILE, PatternTile, QUILT_TILE } from "./tiles";

/** Fired by WaitlistForm on a successful join: the quilt's gems light up. */
export const WAITLIST_JOINED_EVENT = "rionna:waitlist-joined";

const COLUMNS = 4;
const ROWS = 8;
const WAVE_STEP_MS = 90;

const SLOTS = Array.from({ length: COLUMNS * ROWS }, (_, index) => ({
	id: `slot-${index}`,
	// Tiles settle in from the top-left corner, diagonal by diagonal.
	delayMs: ((index % COLUMNS) + Math.floor(index / COLUMNS)) * WAVE_STEP_MS,
}));

/**
 * S12-09: the "pattern cells" quilt beside the waitlist form: one pattern
 * (QUILT_TILE) repeated so the rings join into a lattice. Motion is only the
 * load-in wave, a gentle CSS lift on hover, and, when someone joins, the same
 * wave again as the gems light cream. No ambient motion. Decorative only
 * (aria-hidden); reduced motion is handled in globals.css.
 */
export function PatternMosaic({ className }: { className?: string }) {
	const [joined, setJoined] = useState(false);

	useEffect(() => {
		const onJoined = () => setJoined(true);
		window.addEventListener(WAITLIST_JOINED_EVENT, onJoined);
		return () => window.removeEventListener(WAITLIST_JOINED_EVENT, onJoined);
	}, []);

	return (
		<div
			aria-hidden="true"
			className={cn("grid grid-cols-4 content-start overflow-hidden", className)}
		>
			{SLOTS.map((slot) => (
				<div key={slot.id} className="pc-slot aspect-square">
					{/* Keyed on `joined` so the wave replays when someone joins. */}
					<div
						key={joined ? "joined" : "initial"}
						className="pc-face size-full"
						style={{ "--delay": `${slot.delayMs}ms` } as CSSProperties}
					>
						<PatternTile spec={joined ? CELEBRATION_TILE : QUILT_TILE} />
					</div>
				</div>
			))}
		</div>
	);
}
