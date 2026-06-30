"use client";

import { type SuggestionItem, createSuggestionItems } from "novel";
import {
	CodeIcon,
	Heading1Icon,
	Heading2Icon,
	Heading3Icon,
	ImageIcon,
	ListIcon,
	ListOrderedIcon,
	MinusIcon,
	QuoteIcon,
	TextIcon,
	VideoIcon,
} from "lucide-react";

export interface SlashHandlers {
	/** Open the editor's file picker → existing S2-11 image upload flow. */
	openImagePicker: () => void;
	/** Open the video modal (upload .mp4 or paste a URL). */
	openVideoDialog: () => void;
}

/**
 * The slash-menu items, scoped to Circle's renderable block set (S2-12). Built as
 * a factory so the image/video entries can reach the editor-level handlers. The
 * same array feeds both `Command.configure({ suggestion })` and the rendered
 * `EditorCommandList`, so they never drift.
 */
export function buildSlashItems(handlers: SlashHandlers): SuggestionItem[] {
	return createSuggestionItems([
		{
			title: "Text",
			description: "Plain paragraph",
			searchTerms: ["p", "paragraph"],
			icon: <TextIcon className="size-4" />,
			command: ({ editor, range }) =>
				editor.chain().focus().deleteRange(range).setNode("paragraph").run(),
		},
		{
			title: "Heading 1",
			description: "Large section heading",
			searchTerms: ["title", "h1", "big"],
			icon: <Heading1Icon className="size-4" />,
			command: ({ editor, range }) =>
				editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
		},
		{
			title: "Heading 2",
			description: "Medium section heading",
			searchTerms: ["subtitle", "h2", "medium"],
			icon: <Heading2Icon className="size-4" />,
			command: ({ editor, range }) =>
				editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
		},
		{
			title: "Heading 3",
			description: "Small section heading",
			searchTerms: ["h3", "small"],
			icon: <Heading3Icon className="size-4" />,
			command: ({ editor, range }) =>
				editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
		},
		{
			title: "Bullet List",
			description: "Unordered list",
			searchTerms: ["unordered", "ul", "point"],
			icon: <ListIcon className="size-4" />,
			command: ({ editor, range }) =>
				editor.chain().focus().deleteRange(range).toggleBulletList().run(),
		},
		{
			title: "Numbered List",
			description: "Ordered list",
			searchTerms: ["ordered", "ol", "number"],
			icon: <ListOrderedIcon className="size-4" />,
			command: ({ editor, range }) =>
				editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
		},
		{
			title: "Quote",
			description: "Block quote",
			searchTerms: ["blockquote", "cite"],
			icon: <QuoteIcon className="size-4" />,
			command: ({ editor, range }) =>
				editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
		},
		{
			title: "Code",
			description: "Code block",
			searchTerms: ["codeblock", "pre"],
			icon: <CodeIcon className="size-4" />,
			command: ({ editor, range }) =>
				editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
		},
		{
			title: "Divider",
			description: "Horizontal rule",
			searchTerms: ["hr", "line", "separator"],
			icon: <MinusIcon className="size-4" />,
			command: ({ editor, range }) =>
				editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
		},
		{
			title: "Image",
			description: "Upload an image",
			searchTerms: ["photo", "picture", "media"],
			icon: <ImageIcon className="size-4" />,
			command: ({ editor, range }) => {
				editor.chain().focus().deleteRange(range).run();
				handlers.openImagePicker();
			},
		},
		{
			title: "Video",
			description: "Upload or embed a video",
			searchTerms: ["embed", "youtube", "vimeo", "upload"],
			icon: <VideoIcon className="size-4" />,
			command: ({ editor, range }) => {
				editor.chain().focus().deleteRange(range).run();
				handlers.openVideoDialog();
			},
		},
	]);
}
