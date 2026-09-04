/**
 * Plain-text member post body → Novel(TipTap) doc (S12-02a).
 *
 * The member composer is a plain textarea, not a rich editor — this is the
 * thin bridge from that plain text to the doc shape `serializeNovelDocToCircle`
 * (`packages/payments/lib/circle/serialize.ts`) expects: blank-line-separated
 * groups become paragraphs, single newlines within a group become `hardBreak`s,
 * and bare URLs are auto-linked. An optional uploaded image is appended as a
 * doc-level image node pointing at the auth-gated media proxy (the same `src`
 * shape the serializer's `uploadInlineImage` reads, see serialize.ts:262).
 */

import type { NovelDoc, TiptapNode } from "@repo/payments/lib/circle";

const URL_RE = /https?:\/\/\S+/g;

function textRunToNodes(text: string): TiptapNode[] {
	const nodes: TiptapNode[] = [];
	let lastIndex = 0;
	for (const match of text.matchAll(URL_RE)) {
		const start = match.index ?? 0;
		if (start > lastIndex) {
			nodes.push({ type: "text", text: text.slice(lastIndex, start) });
		}
		const url = match[0];
		nodes.push({
			type: "text",
			text: url,
			marks: [{ type: "link", attrs: { href: url } }],
		});
		lastIndex = start + url.length;
	}
	if (lastIndex < text.length) {
		nodes.push({ type: "text", text: text.slice(lastIndex) });
	}
	return nodes;
}

function groupToNodes(group: string): TiptapNode[] {
	const lines = group.split("\n");
	const nodes: TiptapNode[] = [];
	lines.forEach((line, index) => {
		if (index > 0) nodes.push({ type: "hardBreak" });
		nodes.push(...textRunToNodes(line));
	});
	return nodes;
}

export function buildPostDoc(p: { body: string; imageKey?: string }): NovelDoc {
	const groups = p.body
		.split(/\n{2,}/)
		.map((group) => group.trim())
		.filter((group) => group.length > 0);

	const content: TiptapNode[] = groups.map((group) => ({
		type: "paragraph",
		content: groupToNodes(group),
	}));

	if (p.imageKey) {
		content.push({ type: "image", attrs: { src: `/image-proxy/media/${p.imageKey}` } });
	}

	return { type: "doc", content };
}
