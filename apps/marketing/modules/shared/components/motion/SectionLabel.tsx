import { cn } from "@repo/ui";

/** Chapter label: "01 / Our story" (zero-padded index, slash, mono caps). */
export function SectionLabel({
	index,
	label,
	className,
}: {
	index: number;
	label: string;
	className?: string;
}) {
	return (
		<span className={cn("type-label text-plum", className)}>
			{String(index).padStart(2, "0")} / {label}
		</span>
	);
}
