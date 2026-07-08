/**
 * Circle block registry — the single source of truth for "what Circle's TipTap
 * renderer supports" (https://api.circle.so/get-started/concepts/tiptap-editor).
 *
 * PLAIN DATA ONLY — no editor / React / React-Native imports — so it can be shared
 * by the write path (serialize.ts) and the read path (the renderer + hydrate), and
 * later ported verbatim to the mobile RN renderer. Add/adjust a Circle block HERE
 * and every consumer stays in lockstep.
 */

export type CircleBlockKind = "node" | "mark";
/** How the renderer resolves a node's real content from the doc-level maps. */
export type CircleResolveVia = "sgid" | "inlineAttachment" | null;

export interface CircleBlock {
	type: string;
	kind: CircleBlockKind;
	/** Can the admin author it in our composer? (poll/file/entity: no — Circle-only.) */
	authorable: boolean;
	resolvesVia: CircleResolveVia;
}

export const CIRCLE_BLOCKS: readonly CircleBlock[] = [
	// structural / text nodes
	{ type: "doc", kind: "node", authorable: false, resolvesVia: null },
	{ type: "paragraph", kind: "node", authorable: true, resolvesVia: null },
	{ type: "heading", kind: "node", authorable: true, resolvesVia: null },
	{ type: "bulletList", kind: "node", authorable: true, resolvesVia: null },
	{ type: "orderedList", kind: "node", authorable: true, resolvesVia: null },
	{ type: "listItem", kind: "node", authorable: true, resolvesVia: null },
	{ type: "blockquote", kind: "node", authorable: true, resolvesVia: null },
	{ type: "codeBlock", kind: "node", authorable: true, resolvesVia: null },
	{ type: "horizontalRule", kind: "node", authorable: true, resolvesVia: null },
	{ type: "hardBreak", kind: "node", authorable: true, resolvesVia: null },
	{ type: "text", kind: "node", authorable: true, resolvesVia: null },
	// media / resolved nodes
	{ type: "image", kind: "node", authorable: true, resolvesVia: "inlineAttachment" },
	{ type: "embed", kind: "node", authorable: true, resolvesVia: "sgid" },
	{ type: "mention", kind: "node", authorable: false, resolvesVia: "sgid" },
	{ type: "poll", kind: "node", authorable: false, resolvesVia: "sgid" },
	{ type: "file", kind: "node", authorable: false, resolvesVia: "sgid" },
	{ type: "entity", kind: "node", authorable: false, resolvesVia: null },
	// marks
	{ type: "bold", kind: "mark", authorable: true, resolvesVia: null },
	{ type: "italic", kind: "mark", authorable: true, resolvesVia: null },
	{ type: "underline", kind: "mark", authorable: true, resolvesVia: null },
	{ type: "strike", kind: "mark", authorable: true, resolvesVia: null },
	{ type: "code", kind: "mark", authorable: true, resolvesVia: null },
	{ type: "link", kind: "mark", authorable: true, resolvesVia: null },
];

/**
 * Editor node types that aren't Circle blocks but map cleanly onto one. The
 * serializer downconverts these (rather than stripping) so legacy drafts keep
 * their content.
 */
export const CIRCLE_DOWNCONVERT: Record<string, string> = {
	taskList: "bulletList",
	taskItem: "listItem",
};

const BY_TYPE = new Map(CIRCLE_BLOCKS.map((b) => [b.type, b]));
const NODE_TYPES = new Set(CIRCLE_BLOCKS.filter((b) => b.kind === "node").map((b) => b.type));

/** The set of node types Circle's renderer accepts in a post body. */
export function circleNodeTypes(): Set<string> {
	return new Set(NODE_TYPES);
}

export function isCircleNode(type: string): boolean {
	return NODE_TYPES.has(type);
}

export function isAuthorable(type: string): boolean {
	return BY_TYPE.get(type)?.authorable ?? false;
}

export function resolveViaFor(type: string): CircleResolveVia {
	return BY_TYPE.get(type)?.resolvesVia ?? null;
}
