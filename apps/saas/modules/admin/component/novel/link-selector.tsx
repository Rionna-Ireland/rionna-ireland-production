"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@repo/ui/components/popover";
import { cn } from "@repo/ui";
import { type EditorInstance, getUrlFromString } from "novel";
import { CheckIcon, LinkIcon, TrashIcon } from "lucide-react";
import { useState } from "react";

interface LinkSelectorProps {
	editor: EditorInstance;
	isActive: boolean;
}

/** Popover link editor, shared by the toolbar and the selection bubble menu. */
export function LinkSelector({ editor, isActive }: LinkSelectorProps) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");

	function apply() {
		const url = getUrlFromString(value);
		if (url) {
			editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
			setOpen(false);
		}
	}

	return (
		<Popover
			modal
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) {
					setValue((editor.getAttributes("link").href as string) ?? "");
				}
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Link"
					className={cn(
						"gap-1 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10",
						isActive && "bg-foreground/10 text-foreground",
					)}
				>
					<LinkIcon className="size-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="gap-2 flex w-72 p-2">
				<Input
					placeholder="Paste a link"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							apply();
						}
					}}
				/>
				{isActive ? (
					<Button
						type="button"
						size="icon"
						variant="outline"
						aria-label="Remove link"
						onClick={() => {
							editor.chain().focus().unsetLink().run();
							setOpen(false);
						}}
					>
						<TrashIcon className="size-4" />
					</Button>
				) : (
					<Button type="button" size="icon" aria-label="Apply link" onClick={apply}>
						<CheckIcon className="size-4" />
					</Button>
				)}
			</PopoverContent>
		</Popover>
	);
}
