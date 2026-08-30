import type { CircleTiptapBody } from "@repo/payments/lib/circle";

/** A plain description → a minimal Circle `tiptap_body` (one paragraph per line). */
export function descriptionToTiptap(text: string): CircleTiptapBody {
	const paragraphs = text
		.split(/\n+/)
		.map((line) => line.trim())
		.filter(Boolean);
	const content =
		paragraphs.length > 0
			? paragraphs.map((line) => ({
					type: "paragraph",
					content: [{ type: "text", text: line }],
				}))
			: [{ type: "paragraph" }];
	return { body: { type: "doc", content } };
}
