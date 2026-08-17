"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
	NodeViewWrapper,
	type NodeViewProps,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { Button } from "@repo/ui/components/button";
import { ExternalLinkIcon, PlayIcon, XIcon } from "lucide-react";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		embed: {
			/** Insert a video / oEmbed block carrying the source url (+ optional poster). */
			setEmbed: (options: {
				url: string;
				poster?: string;
				signedId?: string;
				attachableSgid?: string;
				contentType?: string;
			}) => ReturnType;
		};
	}
}

/**
 * Resolve a watch/share URL to an embeddable iframe `src` for the in-editor
 * preview. Only YouTube + Vimeo are recognised; anything else renders as a link
 * card (Circle still resolves the real oEmbed server-side at publish via
 * `createEmbed`, so the published post is correct regardless of the preview).
 */
function toEmbedSrc(url: string): string | null {
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^www\./, "");
		if (host === "youtu.be") {
			return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
		}
		if (host === "youtube.com" || host === "m.youtube.com") {
			const id = u.searchParams.get("v");
			return id ? `https://www.youtube.com/embed/${id}` : null;
		}
		if (host === "vimeo.com") {
			const id = u.pathname.split("/").filter(Boolean)[0];
			return id ? `https://player.vimeo.com/video/${id}` : null;
		}
		return null;
	} catch {
		return null;
	}
}

function EmbedView({ node, deleteNode, editor }: NodeViewProps) {
	const url = (node.attrs.url as string) ?? "";
	const poster = (node.attrs.poster as string) ?? "";
	const src = toEmbedSrc(url);

	return (
		<NodeViewWrapper className="relative my-4" data-drag-handle>
			{editor.isEditable && (
				<Button
					type="button"
					size="icon"
					variant="secondary"
					className="-right-2 -top-2 absolute z-10 size-7 rounded-full shadow"
					onClick={() => deleteNode()}
					aria-label="Remove embed"
				>
					<XIcon className="size-4" />
				</Button>
			)}
			{poster ? (
				// Uploaded video: show a poster thumbnail (not a live player) — the real
				// player is rendered in the published Circle post.
				<div className="relative aspect-video w-full overflow-hidden rounded-lg border border-muted bg-black">
					{/* biome-ignore lint/a11y/useAltText: decorative video poster */}
					<img src={poster} alt="Video thumbnail" className="size-full object-cover opacity-80" />
					<div className="absolute inset-0 flex items-center justify-center">
						<span className="flex size-14 items-center justify-center rounded-full bg-black/60 text-white">
							<PlayIcon className="size-6" />
						</span>
					</div>
				</div>
			) : src ? (
				<div className="aspect-video w-full overflow-hidden rounded-lg border border-muted">
					<iframe
						src={src}
						title="Embedded video"
						className="size-full"
						allow="accelerated-sensors; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowFullScreen
					/>
				</div>
			) : (
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					className="gap-2 flex items-center rounded-lg border border-muted bg-card px-4 py-3 text-sm text-muted-foreground hover:bg-muted/40"
				>
					<ExternalLinkIcon className="size-4 shrink-0" />
					<span className="truncate">{url}</span>
				</a>
			)}
		</NodeViewWrapper>
	);
}

/**
 * Circle-aligned `embed` node (matches Circle's TipTap block name). Stores only
 * the source `url`; the serializer mints the Circle `sgid` per node at publish.
 * Renders an `<iframe>`/link in `getHTML()` too, so embeds also show on the
 * public News site which renders the stored HTML.
 */
export const Embed = Node.create({
	name: "embed",
	group: "block",
	atom: true,
	draggable: true,
	selectable: true,

	addAttributes() {
		return {
			url: { default: null },
			// Editor-only poster thumbnail (data URL) for uploaded videos; not emitted
			// to Circle (the serializer mints a `file` block from signedId).
			poster: { default: null, renderHTML: () => ({}) },
			signedId: { default: null, renderHTML: () => ({}) },
			attachableSgid: { default: null, renderHTML: () => ({}) },
			contentType: { default: null, renderHTML: () => ({}) },
		};
	},

	parseHTML() {
		return [{ tag: "div[data-embed-url]" }, { tag: "iframe[src]" }];
	},

	renderHTML({ HTMLAttributes }) {
		const url = (HTMLAttributes.url as string) ?? "";
		const src = toEmbedSrc(url);
		if (src) {
			return [
				"div",
				{ "data-embed-url": url, class: "embed" },
				[
					"iframe",
					mergeAttributes(
						{ src, frameborder: "0", allowfullscreen: "true", class: "aspect-video w-full" },
					),
				],
			];
		}
		return ["div", { "data-embed-url": url, class: "embed" }, ["a", { href: url }, url]];
	},

	addNodeView() {
		return ReactNodeViewRenderer(EmbedView);
	},

	addCommands() {
		return {
			setEmbed:
				({ url, poster, signedId, attachableSgid, contentType }) =>
				({ commands }) =>
					commands.insertContent({
						type: this.name,
						attrs: {
							url,
							poster: poster ?? null,
							signedId: signedId ?? null,
							attachableSgid: attachableSgid ?? null,
							contentType: contentType ?? null,
						},
					}),
		};
	},
});
