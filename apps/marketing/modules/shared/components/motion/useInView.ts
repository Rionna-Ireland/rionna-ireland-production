"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * Taller than the viewport can never reach `threshold` visible, so it counts
 * as in view as soon as it intersects.
 */
export function isEntryInView(entry: IntersectionObserverEntry, threshold: number): boolean {
	if (!entry.isIntersecting) return false;
	const rootHeight = entry.rootBounds?.height ?? globalThis.innerHeight ?? 0;
	return entry.intersectionRatio >= threshold || entry.boundingClientRect.height > rootHeight;
}

/** True once `ref` scrolls into view (stays true when `once`). No IntersectionObserver: true. */
export function useInView(
	ref: RefObject<Element | null>,
	{
		once = true,
		threshold = 0.15,
		rootMargin = "0px 0px -10% 0px",
	}: { once?: boolean; threshold?: number; rootMargin?: string } = {},
): boolean {
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (typeof IntersectionObserver === "undefined") {
			setInView(true);
			return;
		}
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry) return;
				if (isEntryInView(entry, threshold)) {
					setInView(true);
					if (once) observer.disconnect();
				} else if (!once && !entry.isIntersecting) {
					setInView(false);
				}
			},
			{ threshold: [0, threshold], rootMargin },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref, once, threshold, rootMargin]);

	return inView;
}
