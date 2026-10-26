"use client";

import { cn } from "@repo/ui";
import { type ReactNode, useRef } from "react";

import { useInView } from "./useInView";

/**
 * A clip-path wipe that uncovers the photo on first view. `immediate` plays at
 * page time (above the fold); otherwise the observer drives it. The hidden state
 * lives in globals.css behind scripting + no-reduced-motion, so no-JS sees the photo.
 */
export function PhotoUnmask({
	direction = "up",
	immediate,
	className,
	children,
}: {
	direction?: "up" | "down" | "left";
	immediate?: boolean;
	className?: string;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const revealed = useInView(ref);
	return (
		<div
			ref={ref}
			className={cn("unmask", `unmask-${direction}`, immediate && "unmask-now", className)}
			data-revealed={!immediate && revealed ? "" : undefined}
		>
			{children}
		</div>
	);
}
