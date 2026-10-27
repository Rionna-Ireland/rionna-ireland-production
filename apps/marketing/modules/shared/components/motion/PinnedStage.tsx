import { cn } from "@repo/ui";
import type { CSSProperties, ReactNode } from "react";

/**
 * A tall section with a sticky stage. Where scroll timelines are supported (and
 * motion is allowed) globals.css pins the stage and exposes a named view
 * timeline, `--stage`, so descendants can use `animation-timeline: --stage`
 * over `animation-range: contain 0% contain 100%`. Elsewhere it is plain flow.
 */
export function PinnedStage({
	heightSvh,
	className,
	stageClassName,
	wide,
	children,
}: {
	heightSvh: number;
	className?: string;
	stageClassName?: string;
	/** Pin only from 64rem up; below that it is a normal section. */
	wide?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={cn("pin", wide && "pin-wide", className)}
			style={{ "--pin-h": `${heightSvh}svh` } as CSSProperties}
		>
			<div className={cn("pin-stage", stageClassName)}>{children}</div>
		</div>
	);
}
