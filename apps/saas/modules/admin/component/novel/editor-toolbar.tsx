"use client";

import { cn } from "@repo/ui";
import { useEditorState } from "@tiptap/react";
import type { EditorInstance } from "novel";
import {
	BoldIcon,
	CodeIcon,
	Heading1Icon,
	Heading2Icon,
	Heading3Icon,
	ImageIcon,
	ItalicIcon,
	ListIcon,
	ListOrderedIcon,
	MinusIcon,
	type LucideIcon,
	PilcrowIcon,
	QuoteIcon,
	StrikethroughIcon,
	UnderlineIcon,
	VideoIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { EmojiPicker } from "./emoji-picker";
import { LinkSelector } from "./link-selector";

interface EditorToolbarProps {
	editor: EditorInstance | null;
	/** Opens the editor's file picker → existing S2-11 image upload flow. */
	openImagePicker: () => void;
	/** Opens the video modal (upload .mp4 or paste a URL). */
	openVideoDialog: () => void;
}

function ToolbarButton({
	icon: Icon,
	label,
	active,
	disabled,
	onClick,
}: {
	icon: LucideIcon;
	label: string;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-40",
				active && "bg-foreground/10 text-foreground",
			)}
		>
			<Icon className="size-4" />
		</button>
	);
}

function Divider() {
	return <div className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

function Group({ children }: { children: ReactNode }) {
	return <div className="gap-0.5 flex items-center">{children}</div>;
}

export function EditorToolbar({ editor, openImagePicker, openVideoDialog }: EditorToolbarProps) {
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
						paragraph: editor.isActive("paragraph"),
						h1: editor.isActive("heading", { level: 1 }),
						h2: editor.isActive("heading", { level: 2 }),
						h3: editor.isActive("heading", { level: 3 }),
						bulletList: editor.isActive("bulletList"),
						orderedList: editor.isActive("orderedList"),
						blockquote: editor.isActive("blockquote"),
						codeBlock: editor.isActive("codeBlock"),
					}
				: null,
	});

	const disabled = !editor || !state;

	return (
		<div className="gap-1 flex flex-wrap items-center rounded-t-md border border-muted border-b-0 bg-muted/30 px-2 py-1.5">
			<Group>
				<ToolbarButton
					icon={BoldIcon}
					label="Bold"
					active={state?.bold}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleBold().run()}
				/>
				<ToolbarButton
					icon={ItalicIcon}
					label="Italic"
					active={state?.italic}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleItalic().run()}
				/>
				<ToolbarButton
					icon={UnderlineIcon}
					label="Underline"
					active={state?.underline}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleUnderline().run()}
				/>
				<ToolbarButton
					icon={StrikethroughIcon}
					label="Strikethrough"
					active={state?.strike}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleStrike().run()}
				/>
				{editor && <LinkSelector editor={editor} isActive={!!state?.link} />}
			</Group>

			<Divider />

			<Group>
				<ToolbarButton
					icon={PilcrowIcon}
					label="Paragraph"
					active={state?.paragraph && !state?.h1 && !state?.h2 && !state?.h3}
					disabled={disabled}
					onClick={() => editor?.chain().focus().setParagraph().run()}
				/>
				<ToolbarButton
					icon={Heading1Icon}
					label="Heading 1"
					active={state?.h1}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
				/>
				<ToolbarButton
					icon={Heading2Icon}
					label="Heading 2"
					active={state?.h2}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
				/>
				<ToolbarButton
					icon={Heading3Icon}
					label="Heading 3"
					active={state?.h3}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
				/>
			</Group>

			<Divider />

			<Group>
				<ToolbarButton
					icon={ListIcon}
					label="Bullet list"
					active={state?.bulletList}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleBulletList().run()}
				/>
				<ToolbarButton
					icon={ListOrderedIcon}
					label="Numbered list"
					active={state?.orderedList}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleOrderedList().run()}
				/>
				<ToolbarButton
					icon={QuoteIcon}
					label="Quote"
					active={state?.blockquote}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleBlockquote().run()}
				/>
				<ToolbarButton
					icon={CodeIcon}
					label="Code block"
					active={state?.codeBlock}
					disabled={disabled}
					onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
				/>
				<ToolbarButton
					icon={MinusIcon}
					label="Divider"
					disabled={disabled}
					onClick={() => editor?.chain().focus().setHorizontalRule().run()}
				/>
			</Group>

			<Divider />

			<Group>
				<ToolbarButton
					icon={ImageIcon}
					label="Insert image"
					disabled={disabled}
					onClick={openImagePicker}
				/>
				<ToolbarButton
					icon={VideoIcon}
					label="Add video"
					disabled={disabled}
					onClick={openVideoDialog}
				/>
				{editor && <EmojiPicker editor={editor} disabled={disabled} />}
			</Group>
		</div>
	);
}
