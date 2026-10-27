"use client";

import { cn } from "@repo/ui";
import { type CSSProperties, type ElementType, type ReactNode, useRef } from "react";

import { useInView } from "./useInView";

/**
 * Rises 16px and fades in once on first view. Sets `data-revealed`; the hide-
 * before-reveal rule lives in globals.css behind the scripting + no-reduced-
 * motion media query, so no-JS and Reduce Motion always see the content.
 */
export function Reveal({
	as: Tag = "div",
	className,
	delayMs,
	immediate,
	children,
}: {
	as?: ElementType;
	className?: string;
	delayMs?: number;
	/** Above the fold: page-time rise (`.ch-rise`) instead of the hydration-gated observer reveal. */
	immediate?: boolean;
	children: ReactNode;
}) {
	const ref = useRef<HTMLElement>(null);
	const revealed = useInView(ref);
	return (
		<Tag
			ref={ref}
			className={cn(immediate ? "ch-rise" : "reveal", className)}
			data-revealed={!immediate && revealed ? "" : undefined}
			style={delayMs ? ({ "--reveal-delay": `${delayMs}ms` } as CSSProperties) : undefined}
		>
			{children}
		</Tag>
	);
}
