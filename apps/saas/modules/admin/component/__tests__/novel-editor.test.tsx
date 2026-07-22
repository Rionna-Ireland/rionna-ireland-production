// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// tiptap's React wrapper ignores `editable` prop changes after mount (it re-applies
// the editor's current value on setOptions). NovelEditor must sync the prop itself
// via editor.setEditable — these tests pin that behaviour with a fake editor.
const fakeEditor = {
	isEditable: false,
	setEditable: vi.fn((value: boolean) => {
		fakeEditor.isEditable = value;
	}),
};

vi.mock("novel", () => {
	const passthrough =
		() =>
		({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
	const nullComponent = () => () => null;
	const extension = { configure: () => ({}), extend: () => ({ configure: () => ({}) }) };
	return {
		Command: extension,
		EditorRoot: passthrough(),
		EditorContent: ({
			editable,
			onCreate,
			children,
		}: {
			editable?: boolean;
			onCreate?: (args: { editor: typeof fakeEditor }) => void;
			children?: React.ReactNode;
		}) => {
			if (!createdRef.done) {
				createdRef.done = true;
				fakeEditor.isEditable = editable ?? true;
				onCreate?.({ editor: fakeEditor });
			}
			return <div>{children}</div>;
		},
		EditorCommand: nullComponent(),
		EditorCommandEmpty: nullComponent(),
		EditorCommandItem: nullComponent(),
		EditorCommandList: nullComponent(),
		createImageUpload: () => () => {},
		handleCommandNavigation: () => false,
		renderItems: () => ({}),
		StarterKit: extension,
		TiptapImage: extension,
		TiptapLink: extension,
		TiptapUnderline: {},
		UploadImagesPlugin: () => ({}),
		Placeholder: extension,
	};
});

const createdRef = { done: false };

vi.mock("@repo/ui/components/toast", () => ({
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
}));
vi.mock("../novel/editor-bubble-menu", () => ({ EditorBubbleMenu: () => null }));
vi.mock("../novel/editor-toolbar", () => ({ EditorToolbar: () => null }));
vi.mock("../novel/image-bubble-menu", () => ({ ImageBubbleMenu: () => null }));
vi.mock("../novel/embed-extension", () => ({ Embed: {} }));
vi.mock("../novel/slash-command", () => ({ buildSlashItems: () => [] }));
vi.mock("../novel/video-dialog", () => ({ VideoDialog: () => null }));

import { NovelEditor } from "../novel-editor";

describe("NovelEditor editable sync", () => {
	let root: Root | null = null;
	let container: HTMLElement | null = null;

	afterEach(() => {
		act(() => root?.unmount());
		container?.remove();
		root = null;
		container = null;
		createdRef.done = false;
		fakeEditor.isEditable = false;
		fakeEditor.setEditable.mockClear();
	});

	it("enables the editor when the editable prop flips from false to true", () => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		act(() => {
			root?.render(<NovelEditor editable={false} />);
		});
		expect(fakeEditor.isEditable).toBe(false);

		act(() => {
			root?.render(<NovelEditor editable={true} />);
		});

		expect(fakeEditor.setEditable).toHaveBeenCalledWith(true);
		expect(fakeEditor.isEditable).toBe(true);
	});

	it("disables the editor when the editable prop flips from true to false", () => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		act(() => {
			root?.render(<NovelEditor editable={true} />);
		});
		expect(fakeEditor.isEditable).toBe(true);

		act(() => {
			root?.render(<NovelEditor editable={false} />);
		});

		expect(fakeEditor.setEditable).toHaveBeenCalledWith(false);
		expect(fakeEditor.isEditable).toBe(false);
	});
});
