"use client";

import { type CSSProperties, type ElementType, useRef } from "react";

import { useInView } from "./useInView";

export function splitWords(text: string): string[] {
	return text.split(/\s+/).filter(Boolean);
}

/**
 * Words slide up out of a mask, staggered by --step-rise. Plays when a `Reveal`
 * ancestor (or this element) carries `data-revealed`; the CSS is in globals.css.
 */
export function MaskedText({
	as: Tag = "span",
	text,
	className,
	delayMs = 0,
	style,
}: {
	as?: ElementType;
	text: string;
	className?: string;
	delayMs?: number;
	style?: CSSProperties;
}) {
	const ref = useRef<HTMLElement>(null);
	const revealed = useInView(ref);
	return (
		<Tag
			ref={ref}
			className={className}
			data-revealed={revealed ? "" : undefined}
			style={{ "--reveal-delay": `${delayMs}ms`, ...style } as CSSProperties}
		>
			{splitWords(text).map((word, i) => (
				<span key={`${i}:${word}`}>
					{i > 0 && " "}
					<span className="mask-word" style={{ "--i": i } as CSSProperties}>
						<span>{word}</span>
					</span>
				</span>
			))}
		</Tag>
	);
}
