"use client";

import { cn } from "@repo/ui";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import { CELEBRATION_TILE, dealBoard, dealTile, PatternTile, type TileSpec } from "./tiles";

/** Fired by WaitlistForm on a successful join: the quilt turns lilac. */
export const WAITLIST_JOINED_EVENT = "rionna:waitlist-joined";

const COLUMNS = 4;
const ROWS = 8;
const COUNT = COLUMNS * ROWS;
const SEED = 20260927;
const SHUFFLE_MS = 1900;
const HOVER_COOLDOWN_MS = 700;
const WAVE_STEP_MS = 70;

interface Slot {
	/** Fixed board position, used as the React key. */
	id: string;
	spec: TileSpec;
	/** Bumped on every re-deal so the tile remounts and replays its reveal. */
	version: number;
	delayMs: number;
}

function initialSlots(): Slot[] {
	return dealBoard(COUNT, SEED).map((spec, index) => ({
		id: `slot-${index}`,
		spec,
		version: 0,
		// Opening deal sweeps in from the top-left corner, diagonal by diagonal.
		delayMs: diagonal(index) * WAVE_STEP_MS,
	}));
}

function diagonal(index: number): number {
	return (index % COLUMNS) + Math.floor(index / COLUMNS);
}

/**
 * S12-09: the living "pattern cells" quilt beside the waitlist form. Tiles
 * bloom in cell by cell on load, one is re-dealt every couple of seconds,
 * hovering a tile turns it over, and joining the list ripples the whole board
 * to the lilac star. Decorative only (aria-hidden); still under reduced motion.
 */
export function PatternMosaic({ className }: { className?: string }) {
	const [slots, setSlots] = useState<Slot[]>(initialSlots);
	const [celebrating, setCelebrating] = useState(false);
	const lastHover = useRef<number[]>([]);
	const reducedMotion = useRef(false);

	const redeal = useCallback((index: number) => {
		setSlots((current) => {
			const next = [...current];
			const slot = next[index];
			if (!slot) {
				return current;
			}
			next[index] = {
				id: slot.id,
				spec: dealTile(Math.random, slot.spec),
				version: slot.version + 1,
				delayMs: 0,
			};
			return next;
		});
	}, []);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		reducedMotion.current = query.matches;
		const onChange = (event: MediaQueryListEvent) => {
			reducedMotion.current = event.matches;
		};
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	// Idle shuffle: one tile at a time, only while the tab is visible.
	useEffect(() => {
		if (celebrating) {
			return;
		}
		const timer = window.setInterval(() => {
			if (reducedMotion.current || document.hidden) {
				return;
			}
			redeal(Math.floor(Math.random() * COUNT));
		}, SHUFFLE_MS);
		return () => window.clearInterval(timer);
	}, [celebrating, redeal]);

	useEffect(() => {
		const onJoined = () => {
			setCelebrating(true);
			setSlots((current) =>
				current.map((slot, index) => ({
					id: slot.id,
					spec: { ...CELEBRATION_TILE, turn: slot.spec.turn },
					version: slot.version + 1,
					delayMs: reducedMotion.current ? 0 : diagonal(index) * WAVE_STEP_MS,
				})),
			);
		};
		window.addEventListener(WAITLIST_JOINED_EVENT, onJoined);
		return () => window.removeEventListener(WAITLIST_JOINED_EVENT, onJoined);
	}, []);

	const onHover = (index: number) => {
		if (celebrating || reducedMotion.current) {
			return;
		}
		const now = Date.now();
		if (now - (lastHover.current[index] ?? 0) < HOVER_COOLDOWN_MS) {
			return;
		}
		lastHover.current[index] = now;
		redeal(index);
	};

	return (
		<div
			aria-hidden="true"
			className={cn("grid grid-cols-4 content-start overflow-hidden", className)}
		>
			{slots.map((slot, index) => (
				<div
					key={slot.id}
					className="pc-slot aspect-square"
					onPointerEnter={() => onHover(index)}
				>
					<div
						key={slot.version}
						className="pc-face size-full"
						style={{ "--delay": `${slot.delayMs}ms` } as CSSProperties}
					>
						<PatternTile spec={slot.spec} />
					</div>
				</div>
			))}
		</div>
	);
}
