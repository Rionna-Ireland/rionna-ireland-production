/**
 * Hydrate a Circle `tiptap_body` into a self-contained doc: walk the tree and
 * inline each node's resolved data (from the doc-level maps) onto `attrs._resolved`,
 * so leaf renderers read node-local data only and never touch sgid maps. The output
 * is platform-agnostic — the same hydrated doc feeds the web renderer today and the
 * RN renderer later.
 */
import { resolveViaFor } from "./blocks";

export interface HydratedNode {
	type?: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
	content?: HydratedNode[];
}

interface TiptapBody {
	body?: unknown;
	sgids_to_object_map?: Record<string, unknown>;
	inline_attachments?: Array<Record<string, unknown>>;
}

function asRecord(v: unknown): Record<string, unknown> | null {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function hydrateCircleDoc(tiptapBody: unknown): HydratedNode | null {
	const tb = (asRecord(tiptapBody) ?? {}) as TiptapBody;
	const root = asRecord(tb.body) as HydratedNode | null;
	if (!root || !Array.isArray(root.content) || root.content.length === 0) {
		return null;
	}
	const sgidMap = asRecord(tb.sgids_to_object_map) ?? {};
	const inline = Array.isArray(tb.inline_attachments) ? tb.inline_attachments : [];

	const walk = (node: HydratedNode): HydratedNode => {
		const via = node.type ? resolveViaFor(node.type) : null;
		let attrs = node.attrs;

		if (via === "sgid" && typeof node.attrs?.sgid === "string") {
			const resolved = sgidMap[node.attrs.sgid as string];
			if (resolved !== undefined) attrs = { ...node.attrs, _resolved: resolved };
		} else if (via === "inlineAttachment") {
			// Images usually carry attrs.url already; fall back to inline_attachments by signed_id.
			const signedId = node.attrs?.signed_id;
			const match = inline.find((a) => a.signed_id === signedId);
			const url = node.attrs?.url ?? match?.url;
			if (url !== undefined) attrs = { ...node.attrs, url, _resolved: match ?? null };
		}

		const next: HydratedNode = attrs === node.attrs ? { ...node } : { ...node, attrs };
		if (Array.isArray(node.content)) next.content = node.content.map(walk);
		return next;
	};

	return { ...root, content: root.content.map(walk) };
}
