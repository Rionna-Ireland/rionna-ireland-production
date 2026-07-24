import { Fragment, type ReactNode } from "react";

import { extractEmbedIframeSrc } from "../tiptap/embed-html";

/**
 * Read-only renderer for a Circle TipTap document (`tiptap_body.body`).
 *
 * The headless API does NOT return usable `body.html` (it's an "Update available"
 * stub), so post bodies must be rendered from the TipTap doc. Embeds (uploaded
 * video, YouTube/Vimeo, etc.) are `embed` nodes resolved by `sgid` against
 * `tiptap_body.sgids_to_object_map`, which carries a ready-to-use oEmbed iframe.
 *
 * Scope: paragraph, heading, lists, blockquote, hr, hardBreak, text marks
 * (bold/italic/underline/code/link), image, and embed. Unknown nodes render their
 * children (or nothing), so an unsupported block never throws.
 */

interface TiptapNode {
	type?: string;
	text?: string;
	attrs?: Record<string, unknown>;
	content?: TiptapNode[];
	marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
}

interface EmbedObject {
	html?: string;
	url?: string;
	embed_type?: string;
}

interface CirclePostBodyProps {
	doc: unknown;
	embeds: Record<string, unknown>;
}

function str(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function circleDocHasContent(doc: unknown): boolean {
	return Boolean(
		doc &&
			typeof doc === "object" &&
			Array.isArray((doc as TiptapNode).content) &&
			(doc as TiptapNode).content!.length > 0,
	);
}

export function CirclePostBody({ doc, embeds }: CirclePostBodyProps) {
	if (!circleDocHasContent(doc)) {
		return null;
	}
	const root = doc as TiptapNode;
	return (
		<div className="prose prose-neutral dark:prose-invert mt-10 max-w-none prose-headings:font-display prose-headings:font-medium">
			{(root.content ?? []).map((node, i) => renderNode(node, String(i), embeds))}
		</div>
	);
}

function renderNode(node: TiptapNode, key: string, embeds: Record<string, unknown>): ReactNode {
	const children = () => (node.content ?? []).map((c, i) => renderNode(c, `${key}-${i}`, embeds));

	switch (node.type) {
		case "text": {
			let el: ReactNode = node.text ?? "";
			for (const mark of node.marks ?? []) {
				if (mark.type === "bold") el = <strong>{el}</strong>;
				else if (mark.type === "italic") el = <em>{el}</em>;
				else if (mark.type === "underline") el = <u>{el}</u>;
				else if (mark.type === "code") el = <code>{el}</code>;
				else if (mark.type === "link" && str(mark.attrs?.href)) {
					el = (
						<a href={str(mark.attrs?.href)!} target="_blank" rel="noopener noreferrer">
							{el}
						</a>
					);
				}
			}
			return <Fragment key={key}>{el}</Fragment>;
		}
		case "paragraph":
			return <p key={key}>{children()}</p>;
		case "heading": {
			const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 1), 4);
			const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
			return <Tag key={key}>{children()}</Tag>;
		}
		case "bulletList":
			return <ul key={key}>{children()}</ul>;
		case "orderedList":
			return <ol key={key}>{children()}</ol>;
		case "listItem":
			return <li key={key}>{children()}</li>;
		case "blockquote":
			return <blockquote key={key}>{children()}</blockquote>;
		case "hardBreak":
			return <br key={key} />;
		case "horizontalRule":
			return <hr key={key} />;
		case "image": {
			const src = str(node.attrs?.url) ?? str(node.attrs?.src);
			if (!src) return null;
			// biome-ignore lint/a11y/useAltText: alt derived from attrs when present
			return <img key={key} src={src} alt={str(node.attrs?.alt) ?? ""} className="rounded-xl" />;
		}
		case "embed": {
			const sgid = str(node.attrs?.sgid);
			const embed = sgid && typeof embeds[sgid] === "object" ? (embeds[sgid] as EmbedObject) : null;
			// Never inject embed.html verbatim (stored-XSS surface, Kimi H3):
			// rebuild the iframe from its validated https src instead.
			const iframeSrc = extractEmbedIframeSrc(embed?.html ?? null);
			if (iframeSrc) {
				return (
					<div key={key} className="my-6 overflow-hidden rounded-xl">
						<iframe
							src={iframeSrc}
							title="Embedded media"
							className="aspect-video w-full"
							loading="lazy"
							allowFullScreen
							referrerPolicy="no-referrer"
						/>
					</div>
				);
			}
			if (str(embed?.url)) {
				return (
					<p key={key}>
						<a href={str(embed?.url)!} target="_blank" rel="noopener noreferrer">
							View media
						</a>
					</p>
				);
			}
			return null;
		}
		default:
			return node.content ? <Fragment key={key}>{children()}</Fragment> : null;
	}
}
