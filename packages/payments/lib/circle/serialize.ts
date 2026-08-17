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
 *  - inline `embed` nodes:
 *      YouTube/Vimeo/etc. mint a Circle sgid via `createEmbed` (iframely oEmbed)
 *      and rewrite to `{ type:"embed", attrs:{ sgid } }`.
 *      Native uploads (iPhone .mov etc.) cannot be oEmbedded — iframely 4xxs
 *      and the whole publish used to fail. Those nodes carry `signedId` /
 *      `attachableSgid` from `direct_uploads` and rewrite to a Circle `file`
 *      block instead. Circle-CDN urls without a blob id degrade to a link so
 *      a draft still publishes.
 *  - a legacy `videoUrl` option → one `embed` node appended to the body (kept for
 *    drafts authored before inline embeds; new posts carry embeds in the body).
 *  - `taskList`/`taskItem` downconvert to `bulletList`/`listItem`; any node outside
 *    Circle's renderable set is stripped so a stray block never breaks publish.
 *  - everything else (text, marks, headings, lists) passes through unchanged.
 *
 * Fails safe: any fetch/upload/embed failure returns `{ ok: false }` so the
 * caller can surface the "post directly in Circle" fallback.
 */

import { CIRCLE_DOWNCONVERT, isCircleNode } from "./blocks";
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
const EMBED_NODE_TYPE = "embed";
const FILE_NODE_TYPE = "file";

const OEMBED_HOSTS = new Set([
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"youtu.be",
	"vimeo.com",
	"www.vimeo.com",
	"player.vimeo.com",
	"wistia.com",
	"www.wistia.com",
	"fast.wistia.net",
	"loom.com",
	"www.loom.com",
]);

function hostnameOf(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return null;
	}
}

function isOEmbedVideoUrl(url: string): boolean {
	const host = hostnameOf(url);
	if (!host) return false;
	if (OEMBED_HOSTS.has(host)) return true;
	return host.endsWith(".wistia.com") || host.endsWith(".wistia.net");
}

function isCircleAssetUrl(url: string): boolean {
	const host = hostnameOf(url);
	return (
		host === "assets-v2.circle.so" ||
		host === "assets.circle.so" ||
		Boolean(host?.endsWith(".circle.so"))
	);
}

function strAttr(
	attrs: Record<string, unknown> | undefined,
	...keys: string[]
): string | undefined {
	if (!attrs) return undefined;
	for (const key of keys) {
		const value = attrs[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return undefined;
}

/** Native Circle blob (from direct_uploads) → `file` block. Null if we only have a URL. */
function uploadedVideoFileNode(attrs: Record<string, unknown> | undefined): TiptapNode | null {
	const sgid = strAttr(attrs, "attachableSgid", "attachable_sgid");
	const signedId = strAttr(attrs, "signedId", "signed_id");
	if (!sgid && !signedId) return null;
	const url = strAttr(attrs, "url");
	const contentType = strAttr(attrs, "contentType", "content_type") ?? "video/mp4";
	return {
		type: FILE_NODE_TYPE,
		attrs: {
			...(sgid ? { sgid } : {}),
			...(signedId ? { signed_id: signedId } : {}),
			...(url ? { url } : {}),
			content_type: contentType,
		},
	};
}

function linkParagraph(url: string): TiptapNode {
	return {
		type: "paragraph",
		content: [
			{
				type: "text",
				text: url,
				marks: [{ type: "link", attrs: { href: url, target: "_blank" } }],
			},
		],
	};
}

type Failure = { reason: SerializeFailure; raw?: unknown };

export async function serializeNovelDocToCircle(
	doc: NovelDoc,
	options: { videoUrl?: string },
	deps: SerializeDeps,
): Promise<SerializeOutcome> {
	// Ref object (not a plain `let`) so TS reads the failure freshly after the
	// awaited walk rather than narrowing the closure-mutated local to `never`.
	const failure: { value: Failure | null } = { value: null };

	// Walk the doc, rewriting media nodes in place: image nodes upload their bytes
	// and carry a signed_id; embed nodes mint a Circle sgid from their url. Legacy
	// task lists downconvert to bullet lists; any node outside Circle's renderable
	// set is stripped. Recurses into child content.
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

			if (node.type === EMBED_NODE_TYPE) {
				const fileNode = uploadedVideoFileNode(node.attrs);
				if (fileNode) {
					out.push(fileNode);
					continue;
				}

				const url = strAttr(node.attrs, "url");
				if (!url) continue;

				// Iframely (`POST /embeds`) is YouTube/Vimeo/Wistia. A Circle CDN
				// .mov from iPhone camera 4xxs and used to fail the whole publish.
				if (!isOEmbedVideoUrl(url) && isCircleAssetUrl(url)) {
					out.push(linkParagraph(url));
					continue;
				}

				const embed = await deps.circle.createEmbed({ url });
				if (!embed.ok) {
					failure.value = { reason: embed.reason, raw: embed.raw };
					break;
				}
				out.push({ type: EMBED_NODE_TYPE, attrs: { sgid: embed.data.sgid } });
				continue;
			}

			// Strip anything Circle can't render (unless it downconverts) so a stray
			// block never reaches the API and breaks publish.
			const mapped = CIRCLE_DOWNCONVERT[node.type];
			if (!mapped && !isCircleNode(node.type)) {
				continue;
			}

			// Downconverted nodes start fresh (drop e.g. taskItem's `checked` attr);
			// in-set nodes keep their attrs/marks.
			const base: TiptapNode = mapped ? { type: mapped } : { ...node };
			if (Array.isArray(node.content)) {
				out.push({ ...base, content: await transform(node.content) });
			} else {
				out.push(base);
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

	// Carry the author's chosen alignment through to Circle. Centered images render
	// full-width; left/right are floated at half width so text wraps (matching the
	// in-editor layout). Defaults to centered/full-width.
	const alignment =
		node.attrs?.alignment === "left" || node.attrs?.alignment === "right"
			? node.attrs.alignment
			: "center";
	const width = alignment === "center" ? "100%" : "50%";

	return {
		ok: true,
		node: {
			type: IMAGE_NODE_TYPE,
			attrs: {
				signed_id: upload.data.signedId,
				content_type: image.contentType,
				width,
				alignment,
				...(upload.data.url ? { url: upload.data.url } : {}),
			},
		},
	};
}
