/**
 * Novel(TipTap) → Circle serializer (S2-09).
 *
 * THE isolated, thin layer that bridges our editor's JSONContent to Circle's
 * `tiptap_body`. A Circle schema change touches only this file and the request
 * shapes in real.ts. Kept dependency-injected (no storage or editor imports) so
 * it is trivially unit-testable.
 *
 * Mapping (image shape confirmed against the live Circle API + docs,
 * https://api.circle.so/get-started/concepts/tiptap-editor):
 *  - image nodes → bytes fetched via the injected `fetchImageBytes`, uploaded
 *    through `uploadImage` (→ `signed_id`), and rewritten IN PLACE as a Circle
 *    inline image block `{ type:"image", attrs:{ signed_id, content_type, … } }`.
 *    (Post-level `attachments` does NOT render inline — it silently no-ops; the
 *    image must carry its `signed_id` inside the body, just as `embed` carries
 *    its `sgid`. Circle resolves `url` + `inline_attachments` server-side.)
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

type Failure = { reason: SerializeFailure; raw?: unknown };

export async function serializeNovelDocToCircle(
	doc: NovelDoc,
	options: { videoUrl?: string },
	deps: SerializeDeps,
): Promise<SerializeOutcome> {
	// Ref object (not a plain `let`) so TS reads the failure freshly after the
	// awaited walk rather than narrowing the closure-mutated local to `never`.
	const failure: { value: Failure | null } = { value: null };

	// Walk the doc, replacing each image node in place with a Circle inline image
	// block carrying the uploaded signed_id. Recurses into child content.
	const transform = async (nodes: TiptapNode[]): Promise<TiptapNode[]> => {
		const out: TiptapNode[] = [];
		for (const node of nodes) {
			if (failure.value) break;
			if (node.type === IMAGE_NODE_TYPE) {
				const inline = await uploadInlineImage(node, deps);
				if (!inline.ok) {
					failure.value = { reason: inline.reason, raw: inline.raw };
					break;
				}
				if (inline.node) out.push(inline.node);
				continue;
			}
			if (Array.isArray(node.content)) {
				out.push({ ...node, content: await transform(node.content) });
			} else {
				out.push(node);
			}
		}
		return out;
	};

	const content = await transform(doc.content ?? []);
	if (failure.value) {
		return { ok: false, reason: failure.value.reason, raw: failure.value.raw };
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
		attachments: [],
	};
}

type InlineImageResult =
	| { ok: true; node: TiptapNode | null }
	| { ok: false; reason: SerializeFailure; raw?: unknown };

/**
 * Fetch + upload one image node's bytes and return the Circle inline image block.
 * An image node with no usable `src` is dropped (`node: null`).
 */
async function uploadInlineImage(
	node: TiptapNode,
	deps: SerializeDeps,
): Promise<InlineImageResult> {
	const src = node.attrs?.src;
	if (typeof src !== "string") {
		return { ok: true, node: null };
	}

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
	if (!upload.ok) {
		return { ok: false, reason: upload.reason, raw: upload.raw };
	}

	return {
		ok: true,
		node: {
			type: IMAGE_NODE_TYPE,
			attrs: {
				signed_id: upload.data.signedId,
				content_type: image.contentType,
				width: "100%",
				alignment: "center",
				...(upload.data.url ? { url: upload.data.url } : {}),
			},
		},
	};
}
