"use client";

import { useInView } from "@shared/components/motion/useInView";
import { type ReactNode, useRef } from "react";

/** Sets `data-revealed` once the row scrolls into view; the cards' deal-in is CSS (.deal-row). */
export function DealRow({
	id,
	className,
	children,
}: {
	id?: string;
	className?: string;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const revealed = useInView(ref);
	return (
		<div ref={ref} id={id} className={className} data-revealed={revealed ? "" : undefined}>
			{children}
		</div>
	);
}
