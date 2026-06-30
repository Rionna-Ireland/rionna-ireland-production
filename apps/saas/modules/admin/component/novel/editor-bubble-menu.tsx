"use client";

import { cn } from "@repo/ui";
import { useEditorState } from "@tiptap/react";
import { EditorBubble, EditorBubbleItem, useEditor } from "novel";
import {
	BoldIcon,
	ItalicIcon,
	type LucideIcon,
	StrikethroughIcon,
	UnderlineIcon,
} from "lucide-react";

import { LinkSelector } from "./link-selector";

function BubbleButton({ icon: Icon, active }: { icon: LucideIcon; active?: boolean }) {
	return (
		<span
			className={cn(
				"flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/10",
				active && "text-foreground",
			)}
		>
			<Icon className="size-4" />
		</span>
	);
}

/** Inline formatting bubble shown on text selection (marks + link). */
export function EditorBubbleMenu() {
	const { editor } = useEditor();
	const state = useEditorState({
		editor,
		selector: ({ editor }) =>
			editor
				? {
						bold: editor.isActive("bold"),
						italic: editor.isActive("italic"),
						underline: editor.isActive("underline"),
						strike: editor.isActive("strike"),
						link: editor.isActive("link"),
					}
				: null,
	});

	if (!editor) return null;

	return (
		<EditorBubble
			pluginKey="text-bubble"
			shouldShow={({ editor, from, to }) =>
				from !== to && !editor.isActive("image") && !editor.isActive("embed")
			}
			tippyOptions={{ placement: "top" }}
			className="gap-0.5 flex w-fit overflow-hidden rounded-md border border-muted bg-background p-0.5 shadow-xl"
		>
			<EditorBubbleItem onSelect={(e) => e.chain().focus().toggleBold().run()}>
				<BubbleButton icon={BoldIcon} active={state?.bold} />
			</EditorBubbleItem>
			<EditorBubbleItem onSelect={(e) => e.chain().focus().toggleItalic().run()}>
				<BubbleButton icon={ItalicIcon} active={state?.italic} />
			</EditorBubbleItem>
			<EditorBubbleItem onSelect={(e) => e.chain().focus().toggleUnderline().run()}>
				<BubbleButton icon={UnderlineIcon} active={state?.underline} />
			</EditorBubbleItem>
			<EditorBubbleItem onSelect={(e) => e.chain().focus().toggleStrike().run()}>
				<BubbleButton icon={StrikethroughIcon} active={state?.strike} />
			</EditorBubbleItem>
			<LinkSelector editor={editor} isActive={!!state?.link} />
		</EditorBubble>
	);
}
