"use client";

import { useInView } from "@shared/components/motion/useInView";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { parseStatValue } from "../lib/parseStatValue";

const COUNT_MS = 1400; // --dur-deal; kept in sync by hand because rAF cannot read a CSS token cheaply

// cubic-bezier(0.22, 1, 0.36, 1) (--ease-out-editorial) solved for y at progress t.
function easeOutEditorial(t: number): number {
	const [x1, y1, x2, y2] = [0.22, 1, 0.36, 1];
	const bez = (a: number, b: number, s: number) =>
		3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 20; i++) {
		const mid = (lo + hi) / 2;
		if (bez(x1, x2, mid) < t) lo = mid;
		else hi = mid;
	}
	return bez(y1, y2, (lo + hi) / 2);
}

type Phase = "final" | "armed" | "counting" | "done";

/**
 * One stat tile. SSR, no-JS, Reduce Motion and "already in view at hydration"
 * all keep the final text; only a tile that starts below the fold counts up,
 * once, when it enters view. The digits are aria-hidden; the label carries the value.
 */
export function CountUp({
	value,
	label,
	className,
	delayMs = 0,
}: {
	value: string;
	label: string;
	className?: string;
	delayMs?: number;
}) {
	const parsed = parseStatValue(value);
	const ref = useRef<HTMLDivElement>(null);
	const digitsRef = useRef<HTMLSpanElement>(null);
	const [phase, setPhase] = useState<Phase>("final");
	const inView = useInView(ref);

	// Decide before paint: below the fold at hydration -> hold at 0 until it scrolls in.
	useLayoutEffect(() => {
		const el = ref.current;
		if (!parsed || !el) return;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (!reduce && el.getBoundingClientRect().top >= window.innerHeight) setPhase("armed");
		// biome-ignore lint/correctness/useExhaustiveDependencies: decided once at hydration
	}, []);

	useEffect(() => {
		if (phase !== "armed" || !inView || !parsed) return;
		const { prefix, number, decimals, suffix, grouping } = parsed;
		const fmt = new Intl.NumberFormat("en-US", {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
			useGrouping: grouping,
		});
		let frame = 0;
		let start = 0;
		const tick = (now: number) => {
			start ||= now + delayMs;
			const t = Math.min(Math.max((now - start) / COUNT_MS, 0), 1);
			if (digitsRef.current) {
				digitsRef.current.textContent = `${prefix}${fmt.format(number * easeOutEditorial(t))}${suffix}`;
			}
			if (t < 1) frame = requestAnimationFrame(tick);
			else setPhase("done");
		};
		setPhase("counting");
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [phase, inView, parsed, delayMs]);

	// While armed/counting React must not overwrite the rAF-written text with the final value.
	const hold = phase === "armed" || phase === "counting";
	const zero = parsed ? `${parsed.prefix}${(0).toFixed(parsed.decimals)}${parsed.suffix}` : value;

	return (
		<div ref={ref} className={`relative ${className ?? ""}`}>
			<span role="img" aria-label={value} className="type-display-lg tabular-nums">
				<span ref={digitsRef} aria-hidden="true" key={hold ? "run" : "final"}>
					{hold ? zero : value}
				</span>
			</span>
			<span className="text-sm opacity-80">{label}</span>
			<span
				aria-hidden="true"
				className="stat-hairline inset-x-6 bottom-3 absolute h-px bg-current opacity-30"
				style={{ transform: hold ? "scaleX(0)" : "scaleX(1)" }}
			/>
		</div>
	);
}
