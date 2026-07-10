"use client";

import { toastError } from "@repo/ui/components/toast";
import {
	type JSONContent,
	Command,
	EditorRoot,
	EditorContent,
	EditorCommand,
	EditorCommandEmpty,
	EditorCommandItem,
	EditorCommandList,
	type EditorInstance,
	createImageUpload,
	handleCommandNavigation,
	renderItems,
	StarterKit,
	TiptapImage,
	TiptapLink,
	TiptapUnderline,
	UploadImagesPlugin,
	Placeholder,
} from "novel";
import { useMemo, useRef, useState } from "react";

import { EditorBubbleMenu } from "./novel/editor-bubble-menu";
import { EditorToolbar } from "./novel/editor-toolbar";
import { ImageBubbleMenu } from "./novel/image-bubble-menu";
import { Embed } from "./novel/embed-extension";
import { buildSlashItems } from "./novel/slash-command";
import { VideoDialog, type VideoUploadHandler } from "./novel/video-dialog";

interface NovelEditorProps {
	initialContent?: JSONContent;
	onChange?: (data: { json: JSONContent; html: string }) => void;
	onUploadImage?: (file: File) => Promise<string>;
	/** When provided, the video modal offers direct .mp4 upload to Circle (member-post
	 * composers). Absent (e.g. News) → the video modal is paste-a-URL only. */
	onUploadVideo?: VideoUploadHandler;
}

const MAX_IMAGE_MB = 10;

// Minimal shape we read off the ProseMirror view to compute a safe insert position.
interface DropTargetView {
	state: { doc: { content: { size: number } }; selection: { from: number } };
	posAtCoords: (coords: { left: number; top: number }) => { pos: number } | null | undefined;
}

// novel's UploadImagesPlugin places the upload placeholder at Decoration.widget(pos + 1).
// If pos === doc.content.size (e.g. dropping at the end of an empty editor) that overflows
// and ProseMirror throws "Position N out of range". Clamp so pos + 1 stays valid.
function clampInsertPos(view: DropTargetView, desired: number): number {
	const max = Math.max(0, view.state.doc.content.size - 1);
	return Math.min(Math.max(desired, 0), max);
}

// TiptapImage extended with novel's UploadImagesPlugin — the plugin renders the
// temporary upload placeholder decoration that createImageUpload swaps for the
// real image node. Without it, createImageUpload throws and no image appears.
const ImageWithUpload = TiptapImage.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			// Circle image alignment (enum left|center|right). Drives the in-editor
			// layout (via data-align CSS) and is passed through to the Circle post by
			// the serializer, so what the author sets is what publishes.
			alignment: {
				default: "center",
				parseHTML: (element) => element.getAttribute("data-align") ?? "center",
				renderHTML: (attributes) =>
					attributes.alignment ? { "data-align": attributes.alignment } : {},
			},
		};
	},
	addProseMirrorPlugins() {
		return [
			UploadImagesPlugin({
				imageClass: "rounded-lg border border-muted opacity-40",
			}),
		];
	},
});

export function NovelEditor({
	initialContent,
	onChange,
	onUploadImage,
	onUploadVideo,
}: NovelEditorProps) {
	const [editor, setEditor] = useState<EditorInstance | null>(null);
	const [videoOpen, setVideoOpen] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// novel's createImageUpload contract: validateFn MUST return a truthy value
	// (it aborts on falsy/void), and onUpload must resolve to the image URL.
	const uploadFn = useMemo(
		() =>
			createImageUpload({
				validateFn: (file) => {
					if (!file.type.startsWith("image/")) {
						toastError("Only image files can be uploaded.");
						return false;
					}
					if (file.size / 1024 / 1024 > MAX_IMAGE_MB) {
						toastError(`Images must be smaller than ${MAX_IMAGE_MB}MB.`);
						return false;
					}
					return true;
				},
				onUpload: async (file) => {
					if (!onUploadImage) {
						throw new Error("Image upload is not configured");
					}
					return await onUploadImage(file);
				},
			}),
		[onUploadImage],
	);

	// Block allow-list: StarterKit already provides paragraph/headings/marks/lists/
	// blockquote/codeBlock/horizontalRule/hardBreak. TaskList/TaskItem are removed
	// (not in Circle's renderable set). Embed is our Circle-aligned video node.
	const slashItems = useMemo(
		() =>
			buildSlashItems({
				openImagePicker: () => fileInputRef.current?.click(),
				openVideoDialog: () => setVideoOpen(true),
			}),
		[],
	);

	const extensions = useMemo(
		() => [
			StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
			ImageWithUpload,
			TiptapLink.configure({ openOnClick: false }),
			TiptapUnderline,
			Placeholder.configure({ placeholder: "Start writing, or press '/' for commands..." }),
			Embed,
			Command.configure({
				suggestion: { items: () => slashItems, render: renderItems },
			}),
		],
		[slashItems],
	);

	const handleUpdate = (editor: EditorInstance) => {
		onChange?.({ json: editor.getJSON() as JSONContent, html: editor.getHTML() });
	};

	const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file && editor) {
			const view = editor.view as unknown as DropTargetView;
			uploadFn(file, editor.view as never, clampInsertPos(view, editor.state.selection.from));
		}
		event.target.value = "";
	};

	return (
		<EditorRoot>
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={onPickFile}
			/>
			<EditorToolbar
				editor={editor}
				openImagePicker={() => fileInputRef.current?.click()}
				openVideoDialog={() => setVideoOpen(true)}
			/>
			<VideoDialog
				editor={editor}
				open={videoOpen}
				onOpenChange={setVideoOpen}
				onUploadVideo={onUploadVideo}
			/>
			<EditorContent
				immediatelyRender={false}
				extensions={extensions}
				initialContent={initialContent}
				onCreate={({ editor }: { editor: EditorInstance }) => setEditor(editor)}
				onUpdate={({ editor }: { editor: EditorInstance }) => handleUpdate(editor)}
				className="rounded-b-md border border-muted"
				editorProps={{
					handleDOMEvents: {
						keydown: (_view: unknown, event: KeyboardEvent) =>
							handleCommandNavigation(event),
					},
					handlePaste: (view: unknown, event: ClipboardEvent) => {
						const file = event.clipboardData?.files?.[0];
						if (!file) return false;
						event.preventDefault();
						const target = view as DropTargetView;
						uploadFn(
							file,
							view as never,
							clampInsertPos(target, target.state.selection.from),
						);
						return true;
					},
					handleDrop: (view: unknown, event: DragEvent, _slice: unknown, moved: boolean) => {
						const file = event.dataTransfer?.files?.[0];
						if (moved || !file) return false;
						event.preventDefault();
						const target = view as DropTargetView;
						const dropped = target.posAtCoords({
							left: event.clientX,
							top: event.clientY,
						});
						uploadFn(
							file,
							view as never,
							clampInsertPos(target, dropped?.pos ?? target.state.doc.content.size),
						);
						return true;
					},
					attributes: {
						class: "prose prose-sm dark:prose-invert prose-headings:font-title focus:outline-none max-w-full min-h-[300px] px-4 py-3 text-foreground caret-foreground [&>p]:block [&>p]:min-w-px",
					},
				}}
			>
				<EditorBubbleMenu />
				<ImageBubbleMenu />
				<EditorCommand
					onKeyDown={(e: React.KeyboardEvent) => handleCommandNavigation(e.nativeEvent)}
					className="px-1 py-2 shadow-md z-50 h-auto max-h-[330px] w-72 overflow-y-auto rounded-md border border-muted bg-background transition-all"
				>
					<EditorCommandEmpty className="px-2 text-muted-foreground">
						No results
					</EditorCommandEmpty>
					<EditorCommandList>
						{slashItems.map((item) => (
							<EditorCommandItem
								key={item.title}
								value={item.title}
								keywords={item.searchTerms}
								onCommand={(val) => item.command?.(val)}
								className="gap-2 flex w-full items-center rounded-md px-2 py-1 text-left text-sm hover:bg-accent aria-selected:bg-accent"
							>
								<div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-muted bg-background">
									{item.icon}
								</div>
								<div>
									<p className="font-medium">{item.title}</p>
									<p className="text-xs text-muted-foreground">{item.description}</p>
								</div>
							</EditorCommandItem>
						))}
					</EditorCommandList>
				</EditorCommand>
			</EditorContent>
		</EditorRoot>
	);
}
