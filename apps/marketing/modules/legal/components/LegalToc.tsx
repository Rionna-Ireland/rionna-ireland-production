"use client";

import type { TocItem } from "@legal/lib/toc";
import { cn } from "@repo/ui";
import { useEffect, useRef, useState } from "react";

/** Sticky table of contents; an ink marker slides to the section being read. */
export function LegalToc({ items, title }: { items: TocItem[]; title: string }) {
	const [active, setActive] = useState(items[0]?.id ?? "");
	const listRef = useRef<HTMLUListElement>(null);
	const [marker, setMarker] = useState<{ y: number; h: number } | null>(null);

	useEffect(() => {
		if (typeof IntersectionObserver === "undefined") return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
			},
			// A heading counts once it crosses the band just under the nav.
			{ rootMargin: "-120px 0px -70% 0px" },
		);
		for (const { id } of items) {
			const el = document.getElementById(id);
			if (el) io.observe(el);
		}
		return () => io.disconnect();
	}, [items]);

	useEffect(() => {
		const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`);
		if (el) setMarker({ y: el.offsetTop, h: el.offsetHeight });
	}, [active]);

	return (
		<nav aria-label={title} className="top-32 hidden self-start lg:sticky lg:block">
			<p className="type-label text-ink-muted">{title}</p>
			<ul ref={listRef} className="mt-4 relative border-l border-outline">
				{marker && (
					<li
						aria-hidden="true"
						className="left-[-1px] top-0 w-0.5 absolute origin-top bg-ink transition-transform duration-(--dur-hover) ease-(--ease-out-editorial) motion-reduce:transition-none"
						style={{ height: 1, transform: `translateY(${marker.y}px) scaleY(${marker.h})` }}
					/>
				)}
				{items.map((item) => (
					<li key={item.id} data-id={item.id}>
						<a
							href={`#${item.id}`}
							aria-current={active === item.id ? "location" : undefined}
							className={cn(
								"py-1.5 pr-2 text-sm block hover:text-ink hover:no-underline",
								item.level === 3 ? "pl-7" : "pl-4",
								active === item.id ? "text-ink" : "text-ink-variant",
							)}
						>
							{item.text}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
