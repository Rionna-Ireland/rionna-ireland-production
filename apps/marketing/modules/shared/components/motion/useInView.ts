"use client";

import { type RefObject, useEffect, useState } from "react";

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
				if (entry.isIntersecting) {
					setInView(true);
					if (once) observer.disconnect();
				} else if (!once) {
					setInView(false);
				}
			},
			{ threshold, rootMargin },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref, once, threshold, rootMargin]);

	return inView;
}
