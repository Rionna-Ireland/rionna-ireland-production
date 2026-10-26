import type { Colourway, TileKind } from "@shared/components/pattern/tiles";

export type NewsTilePost = {
	id: string;
	slug: string;
	title: string;
	subtitle: string | null;
	featuredImageUrl: string | null;
	publishedAt: Date | string | null;
};

/** Pattern placeholders for stories without a photo, cycled by position. */
export const PLACEHOLDERS: { colourway: Colourway; kind: TileKind }[] = [
	{ colourway: "lilac", kind: "ring" },
	{ colourway: "green", kind: "halfDrop" },
	{ colourway: "navy", kind: "quad" },
	{ colourway: "plum", kind: "harlequin" },
	{ colourway: "sageTint", kind: "submarkQuad" },
	{ colourway: "iceTint", kind: "gem" },
];

export const placeholderFor = (i: number) =>
	PLACEHOLDERS[i % PLACEHOLDERS.length] ?? PLACEHOLDERS[0]!;
