import type { CircleTiptapBody } from "./types";

/**
 * Circle event body derivation.
 *
 * Probed against staging (2026-08-28): the Admin API v2 silently IGNORES
 * `tiptap_body` on event create/update — events are stored with
 * `editor: trix` and an empty body, i.e. the composer's description is
 * dropped. Sending `body` as an HTML string ("<div>…</div>") stores and
 * returns the description (member reads surface it via `body_plain_text`).
 * We keep sending `tiptap_body` too — harmless on real Circle, and the
 * local circle-mock consumes it.
 */

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Derive Circle's trix-compatible `body` HTML from a tiptap doc: one
 * `<div>` per non-empty paragraph, text nodes joined, HTML-escaped.
 * Returns null when the doc carries no text (so callers can omit `body`).
 */
export function tiptapDocToTrixBody(tiptapBody: CircleTiptapBody): string | null {
	const paragraphs: string[] = [];
	for (const node of tiptapBody.body.content) {
		if (!node || typeof node !== "object") continue;
		const { type, content } = node as { type?: unknown; content?: unknown };
		if (type !== "paragraph" || !Array.isArray(content)) continue;
		const text = content
			.map((child) => {
				if (!child || typeof child !== "object") return "";
				const { type: childType, text: childText } = child as {
					type?: unknown;
					text?: unknown;
				};
				return childType === "text" && typeof childText === "string" ? childText : "";
			})
			.join("")
			.trim();
		if (text.length > 0) {
			paragraphs.push(`<div>${escapeHtml(text)}</div>`);
		}
	}
	return paragraphs.length > 0 ? paragraphs.join("") : null;
}
