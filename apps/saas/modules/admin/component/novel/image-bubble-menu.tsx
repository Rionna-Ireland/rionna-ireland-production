"use client";

import { cn } from "@repo/ui";
import { useEditorState } from "@tiptap/react";
import { EditorBubble, useEditor } from "novel";
import {
	AlignCenterIcon,
	AlignLeftIcon,
	AlignRightIcon,
	type LucideIcon,
} from "lucide-react";

const ALIGNMENTS: { value: string; icon: LucideIcon; label: string }[] = [
	{ value: "left", icon: AlignLeftIcon, label: "Align left" },
	{ value: "center", icon: AlignCenterIcon, label: "Align center" },
	{ value: "right", icon: AlignRightIcon, label: "Align right" },
];

/**
 * Alignment toolbar shown when an image is selected — mirrors Circle's own image
 * controls. The chosen alignment is stored on the image node and passed through
 * to the published Circle post by the serializer.
 */
export function ImageBubbleMenu() {
	const { editor } = useEditor();
	const alignment = useEditorState({
		editor,
		selector: ({ editor }) => (editor?.getAttributes("image").alignment as string) ?? null,
	});

	if (!editor) return null;

	return (
		<EditorBubble
			pluginKey="image-bubble"
			shouldShow={({ editor }) => editor.isActive("image")}
			tippyOptions={{ placement: "top" }}
			className="gap-0.5 flex w-fit overflow-hidden rounded-md border border-muted bg-background p-0.5 shadow-xl"
		>
			{ALIGNMENTS.map(({ value, icon: Icon, label }) => (
				<button
					key={value}
					type="button"
					aria-label={label}
					aria-pressed={alignment === value}
					title={label}
					onMouseDown={(e) => e.preventDefault()}
					onClick={() =>
						editor.chain().focus().updateAttributes("image", { alignment: value }).run()
					}
					className={cn(
						"flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10",
						alignment === value && "bg-foreground/10 text-foreground",
					)}
				>
					<Icon className="size-4" />
				</button>
			))}
		</EditorBubble>
	);
}
