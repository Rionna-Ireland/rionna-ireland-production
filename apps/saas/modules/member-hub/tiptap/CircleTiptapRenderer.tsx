import { Fragment, type ReactNode } from "react";
import type { HydratedNode } from "@repo/payments/lib/circle/hydrate";
import { CIRCLE_PROSE_CLASS } from "./prose";

/**
 * Lightweight read-only renderer for a HYDRATED Circle doc (see hydrateCircleDoc).
 * Registry-driven switch (Phase-0: no @tiptap/static-renderer). Node coverage tracks
 * the block registry; the sgid/attachment resolution already happened in hydrate, so
 * leaf cases read node-local data only. Unknown nodes render children (never throw).
 */

interface EmbedObject {
	html?: string;
	url?: string;
}
interface PollObject {
	title?: string;
	status?: string;
	poll_options?: Array<{ id: number | string; value?: string }>;
}

function str(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function circleDocHasContent(doc: unknown): boolean {
	return Boolean(
		doc &&
			typeof doc === "object" &&
			Array.isArray((doc as HydratedNode).content) &&
			(doc as HydratedNode).content!.length > 0,
	);
}

export function CircleTiptapRenderer({ doc }: { doc: HydratedNode | null }) {
	if (!circleDocHasContent(doc)) return null;
	return (
		<div className={CIRCLE_PROSE_CLASS}>
			{(doc!.content ?? []).map((node, i) => renderNode(node, String(i)))}
		</div>
	);
}

function renderNode(node: HydratedNode, key: string): ReactNode {
	const children = () => (node.content ?? []).map((c, i) => renderNode(c, `${key}-${i}`));

	switch (node.type) {
		case "text": {
			let el: ReactNode = node.text ?? "";
			for (const mark of node.marks ?? []) {
				if (mark.type === "bold") el = <strong>{el}</strong>;
				else if (mark.type === "italic") el = <em>{el}</em>;
				else if (mark.type === "underline") el = <u>{el}</u>;
				else if (mark.type === "strike") el = <s>{el}</s>;
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
		case "codeBlock":
			return (
				<pre key={key}>
					<code>{children()}</code>
				</pre>
			);
		case "hardBreak":
			return <br key={key} />;
		case "horizontalRule":
			return <hr key={key} />;
		case "image": {
			const src = str(node.attrs?.url) ?? str(node.attrs?.src);
			if (!src) return null;
			const align =
				node.attrs?.alignment === "left" || node.attrs?.alignment === "right"
					? (node.attrs.alignment as string)
					: "center";
			// Mirror the serializer's width intent: centered images are full-width;
			// left/right float at half width so surrounding text wraps. Self-contained
			// classes (not .ProseMirror CSS) so alignment actually renders in the read view.
			const alignClass =
				align === "left"
					? "float-left mr-4 w-1/2"
					: align === "right"
						? "float-right ml-4 w-1/2"
						: "w-full";
			// biome-ignore lint/a11y/useAltText: alt derived from attrs when present
			return (
				<img
					key={key}
					src={src}
					alt={str(node.attrs?.alt) ?? ""}
					data-align={align}
					className={`rounded-xl ${alignClass}`}
				/>
			);
		}
		case "embed": {
			const embed = (node.attrs?._resolved as EmbedObject) ?? null;
			if (embed?.html) {
				return (
					<div
						key={key}
						className="my-6 overflow-hidden rounded-xl"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: Circle-provided oEmbed iframe, read-only
						dangerouslySetInnerHTML={{ __html: embed.html }}
					/>
				);
			}
			return str(embed?.url) ? (
				<p key={key}>
					<a href={str(embed?.url)!} target="_blank" rel="noopener noreferrer">
						View media
					</a>
				</p>
			) : null;
		}
		case "poll": {
			const poll = (node.attrs?._resolved as PollObject) ?? null;
			if (!poll?.title) return null;
			return (
				<div key={key} className="my-6 rounded-xl border border-muted p-4 not-prose">
					<p className="font-medium">{poll.title}</p>
					<ul className="mt-3 space-y-2">
						{(poll.poll_options ?? []).map((opt) => (
							<li key={opt.id} className="rounded-md border border-muted px-3 py-2 text-sm">
								{opt.value}
							</li>
						))}
					</ul>
					{poll.status && poll.status !== "active" ? (
						<p className="mt-2 text-xs text-muted-foreground">Poll closed</p>
					) : null}
				</div>
			);
		}
		// NOTE(S2-18): `mention` and `file` are Circle-authored (authorable:false in the
		// block registry) and not yet rendered — they fall through to `default` and render
		// nothing. Tracked follow-up: render an @mention chip and a file-download link.
		default:
			return node.content ? <Fragment key={key}>{children()}</Fragment> : null;
	}
}
