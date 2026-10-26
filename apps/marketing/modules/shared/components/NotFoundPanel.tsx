"use client";

import { LocaleLink } from "@i18n/routing";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { Reveal } from "@shared/components/motion/Reveal";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import { useEffect, useRef } from "react";

const RADIUS = 220;
const MAX_TURN = 45;

/** Full-viewport navy 404: the mosaic deals in and its spurs turn toward the pointer. */
export function NotFoundPanel({
	code,
	title,
	home,
}: {
	code: string;
	title: string;
	home: string;
}) {
	const mosaic = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const root = mosaic.current;
		// Desktop pointers only, and nothing moves under Reduce Motion.
		if (
			!root ||
			!window.matchMedia("(pointer: fine)").matches ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		)
			return;

		const slots = Array.from(root.querySelectorAll<HTMLElement>(".pc-slot")).map((el) => ({
			stars: Array.from(el.querySelectorAll<SVGElement>(".pc-star")),
			cx: 0,
			cy: 0,
		}));
		const measure = () => {
			root.querySelectorAll<HTMLElement>(".pc-slot").forEach((el, i) => {
				const r = el.getBoundingClientRect();
				slots[i].cx = r.left + r.width / 2;
				slots[i].cy = r.top + r.height / 2;
			});
		};
		measure();

		let frame = 0;
		let x = 0;
		let y = 0;
		const apply = () => {
			frame = 0;
			for (const s of slots) {
				const k = Math.max(0, 1 - Math.hypot(s.cx - x, s.cy - y) / RADIUS);
				for (const star of s.stars) star.style.rotate = k ? `${k * MAX_TURN}deg` : "";
			}
		};
		const onMove = (e: PointerEvent) => {
			x = e.clientX;
			y = e.clientY;
			if (!frame) frame = requestAnimationFrame(apply);
		};

		window.addEventListener("pointermove", onMove);
		window.addEventListener("resize", measure);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("resize", measure);
			cancelAnimationFrame(frame);
		};
	}, []);

	return (
		<div
			data-nav-tone="dark"
			className="grain bg-ink text-white px-6 relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden text-center"
		>
			<div ref={mosaic} className="inset-0 absolute -z-10 opacity-60">
				<PatternMosaic colourway="navy" columns={10} rows={14} observe={false} />
			</div>
			<Reveal immediate>
				<span className="type-label text-lilac">{code}</span>
			</Reveal>
			<MaskedText
				as="h1"
				immediate
				text={title}
				className="mt-3 font-medium font-display text-[clamp(3.5rem,10vw,8rem)] leading-[0.95] text-balance"
			/>
			<Reveal immediate delayMs={500} className="mt-10">
				<LocaleLink href="/" className={v2Button({ variant: "ghostOnDark" })}>
					{home}
				</LocaleLink>
			</Reveal>
		</div>
	);
}
