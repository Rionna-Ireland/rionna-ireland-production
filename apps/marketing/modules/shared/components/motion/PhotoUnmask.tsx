import { cn } from "@repo/ui";
import type { ReactNode } from "react";

/**
 * A clip-path wipe that uncovers the photo. Pure CSS (globals.css): scroll-driven
 * where view timelines exist, page-time for `immediate`; everywhere else (no JS,
 * Reduce Motion, older browsers) there is no clipped state, the photo is visible.
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
	return (
		<div className={cn("unmask", `unmask-${direction}`, immediate && "unmask-now", className)}>
			{children}
		</div>
	);
}
