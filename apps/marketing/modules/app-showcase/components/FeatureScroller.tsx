"use client";

import { cn } from "@repo/ui";
import { Reveal } from "@shared/components/motion/Reveal";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { PhoneFrame } from "./PhoneFrame";

export interface Feature {
	key: string;
	label: string;
	title: string;
	body: string;
	/** CSS colour for the family (blues, pinks, greens). */
	tint: string;
	screens: { src: string; alt: string }[];
}

/**
 * Desktop with motion: one sticky phone, screens crossfade as each text
 * crosses the viewport centre, the section tint follows. Everything else
 * (mobile, Reduce Motion, no JS) is the stacked `.fs-inline` rows; the swap
 * is pure CSS (`.fs-*` in globals.css).
 */
export function FeatureScroller({ features }: { features: Feature[] }) {
	const [active, setActive] = useState(0);
	const texts = useRef<(HTMLElement | null)[]>([]);

	useEffect(() => {
		if (typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting)
						setActive(texts.current.indexOf(entry.target as HTMLElement));
				}
			},
			// A thin band at the viewport centre.
			{ rootMargin: "-50% 0px -50% 0px" },
		);
		for (const el of texts.current) if (el) observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<section data-nav-tone="light" className="fs relative isolate">
			{features.map((f, i) => (
				<div
					key={f.key}
					aria-hidden="true"
					className="fs-tint inset-0 absolute -z-10"
					style={{ background: f.tint, opacity: i === active ? 1 : 0 }}
				/>
			))}
			<div className="lg:grid-cols-2 container grid">
				<div>
					{features.map((f, i) => (
						<article
							key={f.key}
							ref={(el) => {
								texts.current[i] = el;
							}}
							className={cn(
								"fs-row py-16 lg:py-0 lg:min-h-[85svh] gap-10 flex flex-col justify-center",
							)}
							style={{ "--tint": f.tint } as CSSProperties}
						>
							<div className="gap-4 max-w-md flex flex-col">
								<span className="type-label text-plum">{f.label}</span>
								<h2 className="font-display text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[1] tracking-[-0.02em] text-balance">
									{f.title}
								</h2>
								<p className="text-lg text-ink-variant leading-relaxed">{f.body}</p>
							</div>
							<Reveal className="fs-inline mx-auto w-[min(17rem,70vw)]">
								{f.screens[0] && (
									<PhoneFrame src={f.screens[0].src} alt={f.screens[0].alt} />
								)}
							</Reveal>
						</article>
					))}
				</div>
				<div className="fs-sticky top-0 pb-8 sticky h-svh items-center justify-center pt-(--nav-space)">
					<div className="relative w-[min(17rem,36svh)]">
						{features.map((f, i) => (
							<div
								key={f.key}
								className={cn("fs-screen", i === active && "is-active")}
								// Only the active feature's phone is in the a11y tree.
								aria-hidden={i === active ? undefined : true}
							>
								{f.screens[1] && (
									<PhoneFrame
										src={f.screens[1].src}
										alt=""
										sizes="20rem"
										className="fs-back"
									/>
								)}
								{f.screens[0] && (
									<PhoneFrame
										src={f.screens[0].src}
										alt={f.screens[0].alt}
										sizes="20rem"
									/>
								)}
							</div>
						))}
						{/* Reserves the phone's height; screens are absolute. */}
						<div aria-hidden="true" className="aspect-[780/1550] w-full" />
					</div>
				</div>
			</div>
		</section>
	);
}
