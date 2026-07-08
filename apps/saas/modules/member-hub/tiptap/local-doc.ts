import type { HydratedNode } from "@repo/payments/lib/circle/hydrate";

/**
 * Map the composer's LOCAL editor JSON to the hydrated shape the renderer expects,
 * for the admin preview only. Local images carry `src` (not Circle `url`); local
 * embeds carry `url` (not a resolved sgid object). This is an approximation of the
 * published result — the server serializer (image upload, embed sgid mint) is not run.
 */
export function localDocToHydrated(doc: unknown): HydratedNode | null {
	const root = doc as HydratedNode | null;
	if (!root?.content?.length) return null;

	const walk = (node: HydratedNode): HydratedNode => {
		let attrs = node.attrs;
		if (node.type === "image" && node.attrs) {
			attrs = { ...node.attrs, url: node.attrs.url ?? node.attrs.src };
		} else if (node.type === "embed" && typeof node.attrs?.url === "string") {
			attrs = { ...node.attrs, _resolved: { url: node.attrs.url } };
		}
		const next: HydratedNode = attrs === node.attrs ? { ...node } : { ...node, attrs };
		if (Array.isArray(node.content)) next.content = node.content.map(walk);
		return next;
	};
	return { ...root, content: root.content.map(walk) };
}
