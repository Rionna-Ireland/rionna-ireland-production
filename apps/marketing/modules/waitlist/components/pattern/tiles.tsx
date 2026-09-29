import type { CSSProperties, ReactNode } from "react";

/**
 * S12-09 "pattern cells": the brand tile system from the design sheet
 * (Pattern cells.svg), rebuilt as 200×200 SVG tiles so the waitlist can
 * animate them. Four archetypes × colourways (the quilt uses one: QUILT_TILE,
 * so swapping the pattern is a one-line change), geometry taken
 * from the sheet: 20px pixel cells on a grid offset by half a cell, and the
 * thin eight-point star.
 */

export const COLOURWAYS = {
	// `spur`: the harlequin tile's stars (the sheet draws them in `mid`).
	plum: { base: "#3A243C", mid: "#57385A", accent: "#CCA1D0", light: "#F2D6F4", spur: "#57385A" },
	navy: { base: "#172741", mid: "#374B6C", accent: "#B9D8E1", light: "#DAEDF3", spur: "#374B6C" },
	navyLit: {
		base: "#172741",
		mid: "#374B6C",
		accent: "#EEEADF",
		light: "#DAEDF3",
		spur: "#B9D8E1",
	},
	green: {
		base: "#043F29",
		mid: "#A6B999",
		accent: "#EEEADF",
		light: "#D4DCCE",
		spur: "#A6B999",
	},
	cream: {
		base: "#EEEADF",
		mid: "#FFFFFF",
		accent: "#CCA1D0",
		light: "#FFFFFF",
		spur: "#FFFFFF",
	},
} as const;

export type Colourway = keyof typeof COLOURWAYS;
export type TileKind = "quad" | "gem" | "ring" | "harlequin";

export interface TileSpec {
	kind: TileKind;
	colourway: Colourway;
	/** Quarter turns (the ring tile is symmetric, so 0 for the quilt). */
	turn: 0 | 1 | 2 | 3;
}

// The sheet's star, centred on (0,0), tip-to-tip 54.6 units.
const STAR_PATH =
	"M-0.797 -26.812C-0.648 -27.729 0.647 -27.729 0.797 -26.812L3.479 -10.381C3.577 -9.78 4.26 -9.492 4.746 -9.846L18.05 -19.533C18.793 -20.074 19.709 -19.141 19.178 -18.384L9.667 -4.834C9.319 -4.339 9.602 -3.644 10.192 -3.544L26.324 -0.812C27.225 -0.659 27.225 0.659 26.324 0.812L10.192 3.543C9.602 3.643 9.319 4.339 9.667 4.835L19.178 18.384C19.709 19.141 18.793 20.074 18.05 19.533L4.746 9.846C4.26 9.492 3.577 9.78 3.479 10.381L0.797 26.812C0.647 27.729 -0.647 27.729 -0.797 26.812L-3.48 10.381C-3.578 9.78 -4.26 9.492 -4.747 9.846L-18.05 19.533C-18.793 20.074 -19.709 19.141 -19.178 18.384L-9.668 4.835C-9.32 4.339 -9.603 3.643 -10.193 3.543L-26.325 0.812C-27.226 0.66 -27.226 -0.659 -26.325 -0.812L-10.193 -3.544C-9.603 -3.644 -9.32 -4.339 -9.668 -4.834L-19.178 -18.384C-19.71 -19.141 -18.793 -20.074 -18.05 -19.533L-4.747 -9.846C-4.26 -9.492 -3.578 -9.78 -3.48 -10.381L-0.797 -26.812Z";

function Star({ x, y, scale = 1, fill }: { x: number; y: number; scale?: number; fill: string }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<path
				d={STAR_PATH}
				fill={fill}
				className="pc-star"
				style={{ scale: String(scale) } as CSSProperties}
			/>
		</g>
	);
}

/** Cell at grid index k (-5…5 from centre), 20 units, centred like the sheet. */
function Cell({ kx, ky, fill }: { kx: number; ky: number; fill: string }) {
	return <rect x={90 + kx * 20} y={90 + ky * 20} width={20} height={20} fill={fill} />;
}

const RANGE = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

/** The diamond ring (|kx|+|ky| = 5) that touches each edge midpoint. */
function Ring({ fill }: { fill: string }) {
	const cells: ReactNode[] = [];
	for (const kx of RANGE) {
		for (const ky of RANGE) {
			if (Math.abs(kx) + Math.abs(ky) === 5) {
				cells.push(<Cell key={`${kx}:${ky}`} kx={kx} ky={ky} fill={fill} />);
			}
		}
	}
	return <>{cells}</>;
}

function Quad({ c }: { c: (typeof COLOURWAYS)[Colourway] }) {
	return (
		<>
			<rect width={100} height={100} fill={c.mid} />
			<rect x={100} width={100} height={100} fill={c.base} />
			<rect y={100} width={100} height={100} fill={c.base} />
			<rect x={100} y={100} width={100} height={100} fill={c.mid} />
			<Star x={100} y={100} fill={c.accent} />
			<Star x={0} y={0} fill={c.accent} />
			<Star x={200} y={0} fill={c.accent} />
			<Star x={0} y={200} fill={c.accent} />
			<Star x={200} y={200} fill={c.accent} />
		</>
	);
}

function Gem({ c }: { c: (typeof COLOURWAYS)[Colourway] }) {
	// Inner gem: the 3×3 block plus four arms, hollow centre (sheet: clip11).
	const gem: [number, number][] = [
		[-1, -1],
		[0, -1],
		[1, -1],
		[-1, 0],
		[1, 0],
		[-1, 1],
		[0, 1],
		[1, 1],
		[-2, 0],
		[2, 0],
		[0, -2],
		[0, 2],
	];
	return (
		<>
			<rect width={200} height={200} fill={c.base} />
			<Ring fill={c.mid} />
			{gem.map(([kx, ky]) => (
				<Cell key={`g${kx}:${ky}`} kx={kx} ky={ky} fill={c.accent} />
			))}
			{[
				[-5, -5],
				[5, -5],
				[-5, 5],
				[5, 5],
			].map(([kx, ky]) => (
				<Cell key={`c${kx}:${ky}`} kx={kx} ky={ky} fill={c.accent} />
			))}
		</>
	);
}

function RingStar({ c }: { c: (typeof COLOURWAYS)[Colourway] }) {
	return (
		<>
			<rect width={200} height={200} fill={c.mid} />
			<Ring fill={c.base} />
			<Star x={100} y={100} scale={1.2} fill={c.accent} />
			<Star x={0} y={0} scale={1.2} fill={c.accent} />
			<Star x={200} y={0} scale={1.2} fill={c.accent} />
			<Star x={0} y={200} scale={1.2} fill={c.accent} />
			<Star x={200} y={200} scale={1.2} fill={c.accent} />
		</>
	);
}

function Harlequin({ c }: { c: (typeof COLOURWAYS)[Colourway] }) {
	// Two star quadrants and two lozenge quadrants (sheet: clip15–20).
	const lozenges: ReactNode[] = [];
	for (const [ox, oy] of [
		[100, 0],
		[0, 100],
	]) {
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 4; col++) {
				const cx = ox + 12.5 + col * 25;
				const cy = oy + 16.5 + row * 33;
				lozenges.push(
					<path
						key={`${ox}:${oy}:${row}:${col}`}
						d={`M${cx} ${cy - 15}L${cx + 10} ${cy}L${cx} ${cy + 15}L${cx - 10} ${cy}Z`}
						fill={c.mid}
					/>,
				);
			}
		}
	}
	return (
		<>
			<rect width={200} height={200} fill={c.base} />
			{lozenges}
			<Star x={50} y={50} scale={1.25} fill={c.spur} />
			<Star x={150} y={150} scale={1.25} fill={c.spur} />
		</>
	);
}

const RENDERERS = { quad: Quad, gem: Gem, ring: RingStar, harlequin: Harlequin } as const;

export function PatternTile({ spec }: { spec: TileSpec }) {
	const Renderer = RENDERERS[spec.kind];
	return (
		<svg viewBox="0 0 200 200" className="pc-tile block size-full" aria-hidden="true">
			<g transform={`rotate(${spec.turn * 90} 100 100)`}>
				<Renderer c={COLOURWAYS[spec.colourway]} />
			</g>
		</svg>
	);
}

/** The one pattern the waitlist quilt repeats: navy diamonds and spurs (harlequin). */
export const QUILT_TILE: TileSpec = { kind: "harlequin", colourway: "navy", turn: 0 };

/** Everyone through the gate: the same tile, its spurs lit ice blue. */
export const CELEBRATION_TILE: TileSpec = { kind: "harlequin", colourway: "navyLit", turn: 0 };
