/**
 * Novel(TipTap) → Circle serializer (S2-09).
 *
 * THE isolated, thin layer that bridges our editor's JSONContent to Circle's
 * `tiptap_body` + post `attachments`. A Circle schema change touches only this
 * file and the request shapes in real.ts. Kept dependency-injected (no storage
 * or editor imports) so it is trivially unit-testable.
 *
 * Mapping (proven by the live spike, CIRCLE-SPIKE-NOTES.md):
 *  - image nodes → bytes fetched via the injected `fetchImageBytes`, uploaded
 *    through `uploadImage`, collected into POST-LEVEL `attachments`, and removed
 *    from the body (Circle attaches images at the post level, not inline).
 *  - a `videoUrl` → one `embed` node (carrying the Circle sgid) appended to the
 *    body via `createEmbed`.
 *  - everything else (text, marks, headings, lists) passes through unchanged.
 *
 * Fails safe: any fetch/upload/embed failure returns `{ ok: false }` so the
 * caller can surface the "post directly in Circle" fallback.
 */

import type { CircleCallFailure, CircleService, CircleTiptapBody } from "./types";

export interface TiptapNode {
	type: string;
	attrs?: Record<string, unknown>;
	content?: TiptapNode[];
	marks?: unknown[];
	text?: string;
	[key: string]: unknown;
}

export interface NovelDoc {
	type: "doc";
	content?: TiptapNode[];
}

export interface SerializeImageBytes {
	data: Uint8Array;
	contentType: string;
	filename: string;
}

export interface SerializeDeps {
	circle: Pick<CircleService, "uploadImage" | "createEmbed">;
	/** Resolve an image node's `src` (a storage URL) to its raw bytes. */
	fetchImageBytes: (src: string) => Promise<SerializeImageBytes>;
}

export type SerializeFailure = CircleCallFailure | "image_fetch_failed";

export type SerializeOutcome =
	| { ok: true; tiptapBody: CircleTiptapBody; attachments: string[] }
	| { ok: false; reason: SerializeFailure; raw?: unknown };

const IMAGE_NODE_TYPE = "image";

export async function serializeNovelDocToCircle(
	doc: NovelDoc,
	options: { videoUrl?: string },
	deps: SerializeDeps,
): Promise<SerializeOutcome> {
	const imageSrcs: string[] = [];
	const content = filterImages(doc.content ?? [], imageSrcs);

	// Upload images in document order → post-level attachments.
	const attachments: string[] = [];
	for (const src of imageSrcs) {
		let image: SerializeImageBytes;
		try {
			image = await deps.fetchImageBytes(src);
		} catch (err) {
			return { ok: false, reason: "image_fetch_failed", raw: err };
		}
		const upload = await deps.circle.uploadImage({
			filename: image.filename,
			contentType: image.contentType,
			data: image.data,
		});
		if (!upload.ok) return { ok: false, reason: upload.reason, raw: upload.raw };
		attachments.push(upload.data.signedId);
	}

	// Optional video → one appended embed node.
	if (options.videoUrl) {
		const embed = await deps.circle.createEmbed({ url: options.videoUrl });
		if (!embed.ok) return { ok: false, reason: embed.reason, raw: embed.raw };
		content.push({ type: "embed", attrs: { sgid: embed.data.sgid } });
	}

	return {
		ok: true,
		tiptapBody: { body: { type: "doc", content } },
		attachments,
	};
}

/**
 * Return a copy of `nodes` with image nodes removed, collecting their `src`
 * (in document order) into `imageSrcs`. Recurses into child content; never
 * mutates the input.
 */
function filterImages(nodes: TiptapNode[], imageSrcs: string[]): TiptapNode[] {
	const out: TiptapNode[] = [];
	for (const node of nodes) {
		if (node.type === IMAGE_NODE_TYPE) {
			const src = node.attrs?.src;
			if (typeof src === "string") imageSrcs.push(src);
			continue; // drop the image node from the body
		}
		if (Array.isArray(node.content)) {
			out.push({ ...node, content: filterImages(node.content, imageSrcs) });
		} else {
			out.push(node);
		}
	}
	return out;
}
