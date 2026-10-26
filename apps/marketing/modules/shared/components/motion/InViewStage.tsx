"use client";

import { cn } from "@repo/ui";
import { type ReactNode, useRef } from "react";

import { useInView } from "./useInView";

/** Wrapper that sets `data-revealed` once in view, so CSS descendants (check draws, CTA nudge) can key off it. */
export function InViewStage({ className, children }: { className?: string; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const revealed = useInView(ref);
	return (
		<div ref={ref} className={cn(className)} data-revealed={revealed ? "" : undefined}>
			{children}
		</div>
	);
}
