import { cn } from "@repo/ui";
import { Submark } from "@shared/components/brand/Submark";

const tones = {
	ice: "bg-ice text-ink/25",
	cream: "bg-cream text-ink/20",
	lilac: "bg-lilac-light text-plum/25",
	sage: "bg-sage text-forest/25",
} as const;

/** Tinted block with the submark watermark, standing in for photography. */
export function MediaPlaceholder({
	tone,
	tag,
	className,
}: {
	tone: keyof typeof tones;
	tag?: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"min-h-40 relative flex items-center justify-center overflow-hidden rounded-lg",
				tones[tone],
				className,
			)}
		>
			<Submark className="max-h-24 h-1/3 w-auto" />
			{tag && (
				<span className="type-label bottom-3 left-3 text-ink-variant absolute text-[10px]">
					{tag}
				</span>
			)}
		</div>
	);
}
