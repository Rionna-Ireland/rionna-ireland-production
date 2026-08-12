/**
 * Plain-text extraction for member-facing horse updates (S8-01a2).
 *
 * The composer stores the rich body as TipTap/Novel JSON (`bodyJson`), with
 * an HTML mirror (`bodyHtml`) kept for the "has content" check and Circle's
 * pre-publish preview. For the member API we want a plain-text summary —
 * walking `bodyJson`'s text nodes is more robust than stripping `bodyHtml`
 * tags: it can't mash adjacent block content together (paragraphs stay
 * separated) and it doesn't depend on `bodyHtml` having been populated.
 */

interface JSONContentNode {
	type?: string;
	text?: string;
	content?: JSONContentNode[];
}

function collectText(node: JSONContentNode): string {
	if (typeof node.text === "string") {
		return node.text;
	}
	if (!Array.isArray(node.content)) {
		return "";
	}
	return node.content.map(collectText).join("");
}

/**
 * Walks a TipTap/Novel `JSONContent` doc and returns a plain-text summary,
 * one paragraph per top-level block, blocks separated by a blank line.
 * Returns "" for an empty/missing/malformed doc.
 */
export function bodyTextFromJson(doc: unknown): string {
	const node = doc as JSONContentNode | null | undefined;
	if (!node || !Array.isArray(node.content)) {
		return "";
	}
	return node.content
		.map((block) => collectText(block).trim())
		.filter((text) => text.length > 0)
		.join("\n\n");
}
