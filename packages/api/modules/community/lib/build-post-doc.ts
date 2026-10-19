/**
 * Plain-text member post body → Novel(TipTap) doc (S12-02a).
 *
 * The member composer is a plain textarea, not a rich editor — this is the
 * thin bridge from that plain text to the doc shape `serializeNovelDocToCircle`
 * (`packages/payments/lib/circle/serialize.ts`) expects: blank-line-separated
 * groups become paragraphs, single newlines within a group become `hardBreak`s,
 * and bare URLs are auto-linked. Verified direct-to-Circle media (photos
 * as `image` nodes, a video as an `embed` node) is appended in the order given.
 */

import type { NovelDoc, TiptapNode } from "@repo/payments/lib/circle";

import type { MediaTokenPayload } from "./media-token";

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

export function buildPostDoc(p: { body: string; media?: MediaTokenPayload[] }): NovelDoc {
	const normalizedBody = p.body.replace(/\r\n?/g, "\n");
	const groups = normalizedBody
		.split(/\n{2,}/)
		.map((group) => group.trim())
		.filter((group) => group.length > 0);

	const content: TiptapNode[] = groups.map((group) => ({
		type: "paragraph",
		content: groupToNodes(group),
	}));

	// Direct-to-Circle media (S15-01): already uploaded, so the serializer passes these through.
	for (const m of p.media ?? []) {
		content.push(
			m.kind === "image"
				? { type: "image", attrs: { signedId: m.signedId, url: m.cdnUrl, contentType: m.contentType } }
				: {
						type: "embed",
						attrs: { signedId: m.signedId, attachableSgid: m.attachableSgid, url: m.cdnUrl, contentType: m.contentType },
					},
		);
	}

	return { type: "doc", content };
}
