"use client";

import { useInView } from "@shared/components/motion/useInView";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { parseStatValue } from "../lib/parseStatValue";
import { runCount } from "../lib/runCount";

// Duplicates --ease-out-editorial, cubic-bezier(0.22, 1, 0.36, 1) (rAF cannot read the token) solved for y at progress t.
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
	const parsed = useMemo(() => parseStatValue(value), [value]);
	const ref = useRef<HTMLDivElement>(null);
	const digitsRef = useRef<HTMLSpanElement>(null);
	const [armed, setArmed] = useState(false);
	const [done, setDone] = useState(false);
	const inView = useInView(ref);

	// Decide before paint: below the fold at hydration -> hold at 0 until it scrolls in.
	useLayoutEffect(() => {
		const el = ref.current;
		if (!parsed || !el) return;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (!reduce && el.getBoundingClientRect().top >= window.innerHeight) setArmed(true);
	}, [parsed]);

	// Starts once; only unmount (or a value change) cancels it. No setState before the loop runs.
	useEffect(() => {
		if (!armed || !inView || !parsed) return;
		const { prefix, number, decimals, suffix, grouping } = parsed;
		const fmt = new Intl.NumberFormat("en-US", {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
			useGrouping: grouping,
		});
		const css = getComputedStyle(document.documentElement).getPropertyValue("--dur-deal");
		return runCount({
			durationMs: Number.parseFloat(css) || 1400,
			delayMs,
			ease: easeOutEditorial,
			raf: requestAnimationFrame,
			cancelRaf: cancelAnimationFrame,
			onFrame: (e) => {
				if (digitsRef.current)
					digitsRef.current.textContent = `${prefix}${fmt.format(number * e)}${suffix}`;
			},
			onDone: () => setDone(true),
		});
	}, [armed, inView, parsed, delayMs]);

	// While armed and not done React must not overwrite the rAF-written text.
	const hold = armed && !done;
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
