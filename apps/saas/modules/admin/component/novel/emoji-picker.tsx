"use client";

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@repo/ui/components/popover";
import type { EditorInstance } from "novel";
import { SmileIcon } from "lucide-react";
import { useState } from "react";

interface EmojiPickerProps {
	editor: EditorInstance;
	disabled?: boolean;
}

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
	{
		label: "Racing",
		emojis: ["🐎", "🏇", "🏆", "🥇", "🥈", "🥉", "🎯", "🍀", "🌟", "📣"],
	},
	{
		label: "Celebration",
		emojis: ["🎉", "🥳", "👏", "🙌", "🔥", "💪", "✨", "🍾", "🥂", "💚"],
	},
	{
		label: "Faces",
		emojis: ["😀", "😂", "😍", "🤩", "😎", "🤞", "😮", "😢", "🫶", "❤️"],
	},
	{
		label: "Misc",
		emojis: ["☀️", "🌧️", "📅", "📸", "🎥", "📍", "✅", "⚠️", "➡️", "❓"],
	},
];

/** Popover emoji grid for the composer toolbar. Inserts a plain text node. */
export function EmojiPicker({ editor, disabled }: EmojiPickerProps) {
	const [open, setOpen] = useState(false);

	function insert(emoji: string) {
		editor.chain().focus().insertContent(emoji).run();
		setOpen(false);
	}

	return (
		<Popover modal open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Insert emoji"
					title="Insert emoji"
					disabled={disabled}
					className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-40"
				>
					<SmileIcon className="size-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-2">
				<div className="gap-2 flex flex-col">
					{EMOJI_GROUPS.map((group) => (
						<div key={group.label}>
							<p className="mb-1 text-muted-foreground text-xs">{group.label}</p>
							<div className="gap-0.5 grid grid-cols-10">
								{group.emojis.map((emoji) => (
									<button
										key={emoji}
										type="button"
										aria-label={`Insert ${emoji}`}
										onClick={() => insert(emoji)}
										className="flex size-6 items-center justify-center rounded text-base transition-colors hover:bg-foreground/10"
									>
										{emoji}
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
