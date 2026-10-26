"use client";

import type { FeedChip } from "@repo/api/modules/community/lib/types";
import { cn } from "@repo/ui";
import { useRef } from "react";

interface FeedChipsProps {
	chips: FeedChip[];
	selectedId: string;
	onSelect: (id: string) => void;
	label: string;
}

/** Single-select filter chips as a radiogroup: roving tabindex, arrow keys move and select. */
export function FeedChips({ chips, selectedId, onSelect, label }: FeedChipsProps) {
	const refs = useRef<(HTMLButtonElement | null)[]>([]);
	if (chips.length === 0) return null;

	function onKeyDown(event: React.KeyboardEvent, index: number) {
		const step =
			event.key === "ArrowRight" || event.key === "ArrowDown"
				? 1
				: event.key === "ArrowLeft" || event.key === "ArrowUp"
					? -1
					: 0;
		const target =
			event.key === "Home" ? 0 : event.key === "End" ? chips.length - 1 : index + step;
		if (event.key !== "Home" && event.key !== "End" && step === 0) return;
		event.preventDefault();
		const next = (target + chips.length) % chips.length;
		onSelect((chips[next] as FeedChip).id);
		refs.current[next]?.focus();
	}

	return (
		<div role="radiogroup" aria-label={label} className="gap-2 flex flex-wrap">
			{chips.map((chip, index) => {
				const selected = chip.id === selectedId;
				return (
					<button
						key={chip.id}
						ref={(el) => {
							refs.current[index] = el;
						}}
						type="button"
						role="radio"
						aria-checked={selected}
						tabIndex={selected ? 0 : -1}
						onClick={() => onSelect(chip.id)}
						onKeyDown={(e) => onKeyDown(e, index)}
						className={cn(
							"type-label px-4 py-2 rounded-full border transition-colors motion-reduce:transition-none",
							selected
								? "border-lilac bg-lilac text-plum"
								: "border-outline bg-white text-label hover:bg-lilac-light",
						)}
					>
						{chip.label}
					</button>
				);
			})}
		</div>
	);
}
