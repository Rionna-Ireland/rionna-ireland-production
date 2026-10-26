"use client";

import { cn } from "@repo/ui";
import { type ReactNode, useRef } from "react";

import { useInView } from "./useInView";

/** Section that sets `data-playing` only while on screen; ambient loops key off it (paused without it, so no-JS stays static). */
export function PlayWhenVisible({
	id,
	className,
	children,
	...rest
}: {
	id?: string;
	className?: string;
	children: ReactNode;
	"data-chapter"?: string;
	"data-nav-tone"?: string;
}) {
	const ref = useRef<HTMLElement>(null);
	const playing = useInView(ref, { once: false, threshold: 0, rootMargin: "0px" });
	return (
		<section
			ref={ref}
			id={id}
			className={cn(className)}
			data-playing={playing ? "" : undefined}
			{...rest}
		>
			{children}
		</section>
	);
}
