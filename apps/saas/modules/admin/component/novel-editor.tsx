"use client";

import { toastError } from "@repo/ui/components/toast";
import {
	type JSONContent,
	EditorRoot,
	EditorContent,
	EditorCommand,
	EditorCommandEmpty,
	type EditorInstance,
	createImageUpload,
	handleCommandNavigation,
	ImageResizer,
	StarterKit,
	TiptapImage,
	TiptapLink,
	TiptapUnderline,
	UploadImagesPlugin,
	Placeholder,
	TaskItem,
	TaskList,
} from "novel";

interface NovelEditorProps {
	initialContent?: JSONContent;
	onChange?: (data: { json: JSONContent; html: string }) => void;
	onUploadImage?: (file: File) => Promise<string>;
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
	addProseMirrorPlugins() {
		return [
			UploadImagesPlugin({
				imageClass: "rounded-lg border border-muted opacity-40",
			}),
		];
	},
});

export function NovelEditor({ initialContent, onChange, onUploadImage }: NovelEditorProps) {
	const extensions = [
		StarterKit.configure({
			heading: { levels: [1, 2, 3] },
		}),
		ImageWithUpload,
		TiptapLink.configure({ openOnClick: false }),
		TiptapUnderline,
		Placeholder.configure({ placeholder: "Start writing..." }),
		TaskList,
		TaskItem.configure({ nested: true }),
	];

	const handleUpdate = (editor: EditorInstance) => {
		const json = editor.getJSON() as JSONContent;
		const html = editor.getHTML();
		onChange?.({ json, html });
	};

	// novel's createImageUpload contract: validateFn MUST return a truthy value
	// (it aborts on falsy/void), and onUpload must resolve to the image URL.
	const uploadFn = createImageUpload({
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
	});

	return (
		<EditorRoot>
			<EditorContent
				immediatelyRender={false}
				extensions={extensions}
				initialContent={initialContent}
				onUpdate={({ editor }: { editor: EditorInstance }) => handleUpdate(editor)}
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
					handleDrop: (
						view: unknown,
						event: DragEvent,
						_slice: unknown,
						moved: boolean,
					) => {
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
						class: "prose prose-sm dark:prose-invert prose-headings:font-title focus:outline-none max-w-full min-h-[300px] px-4 py-3",
					},
				}}
				slotAfter={<ImageResizer />}
			>
				<EditorCommand
					onKeyDown={(e: React.KeyboardEvent) => handleCommandNavigation(e.nativeEvent)}
					className="px-1 py-2 shadow-md z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-muted bg-background transition-all"
				>
					<EditorCommandEmpty className="px-2 text-muted-foreground">
						No results
					</EditorCommandEmpty>
				</EditorCommand>
			</EditorContent>
		</EditorRoot>
	);
}
