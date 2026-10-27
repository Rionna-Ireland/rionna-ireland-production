"use client";

import { useInView } from "@shared/components/motion/useInView";
import { type ReactNode, useRef } from "react";

/** Sets `data-revealed` once the row scrolls into view; the cards' deal-in is CSS (.deal-row). */
export function DealRow({
	id,
	ariaLabel,
	className,
	children,
}: {
	id?: string;
	ariaLabel?: string;
	className?: string;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const revealed = useInView(ref);
	return (
		<div
			ref={ref}
			id={id}
			tabIndex={ariaLabel ? 0 : undefined}
			role={ariaLabel ? "region" : undefined}
			aria-label={ariaLabel}
			className={className}
			data-revealed={revealed ? "" : undefined}
		>
			{children}
		</div>
	);
}
