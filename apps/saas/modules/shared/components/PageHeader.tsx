"use client";

import { cn } from "@repo/ui";

export function PageHeader({
	title,
	subtitle,
	className,
}: {
	title: string;
	subtitle?: string;
	className?: string;
}) {
	return (
		<div className={cn("mb-8", className)}>
			<h2 className="type-display-md">{title}</h2>
			{subtitle && <p className="mt-1 text-ink-variant">{subtitle}</p>}
		</div>
	);
}
