"use client";

import { cn } from "@repo/ui";
import { useEffect, useState } from "react";

/** Fixed right rail (desktop): ticks jump to chapters; the active one follows scroll. */
export function ChapterRail({ chapters }: { chapters: { id: string; label: string }[] }) {
	const [active, setActive] = useState(chapters[0]?.id);

	useEffect(() => {
		if (typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) setActive(e.target.id);
				}
			},
			// A thin band across the viewport middle: the chapter crossing it is current.
			{ rootMargin: "-50% 0px -49% 0px" },
		);
		for (const el of document.querySelectorAll<HTMLElement>("[data-chapter]")) {
			observer.observe(el);
		}
		return () => observer.disconnect();
	}, []);

	return (
		<nav
			aria-label="Chapters"
			className="right-6 text-white gap-3 lg:flex fixed top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end mix-blend-difference print:hidden"
		>
			{chapters.map((c) => (
				<a
					key={c.id}
					href={`#${c.id}`}
					aria-current={active === c.id ? "true" : undefined}
					className="group gap-3 flex items-center"
				>
					<span
						className={cn(
							"type-label transition-opacity duration-(--dur-hover)",
							active === c.id
								? "opacity-100"
								: "opacity-0 group-hover:opacity-70 group-focus-visible:opacity-100",
						)}
					>
						{c.label}
					</span>
					<span
						className={cn(
							"w-6 bg-white h-px origin-right transition-transform duration-(--dur-hover) ease-(--ease-out-editorial)",
							active === c.id ? "scale-x-100" : "scale-x-50 opacity-50",
						)}
					/>
				</a>
			))}
		</nav>
	);
}
