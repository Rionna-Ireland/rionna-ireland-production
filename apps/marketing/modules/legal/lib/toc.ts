import { slugifyHeadline } from "@shared/lib/content";

export type TocItem = { id: string; text: string; level: 2 | 3 };

/** h2/h3 only; ids match the ones LegalContent puts on the rendered headings. */
export function extractToc(headings: { level: number; text: string }[]): TocItem[] {
	return headings
		.filter((h): h is { level: 2 | 3; text: string } => h.level === 2 || h.level === 3)
		.map((h) => ({ id: slugifyHeadline(h.text), text: h.text, level: h.level }));
}

/** ATX headings from raw markdown (the MDX `content` field), ignoring fenced code. */
export function parseHeadings(markdown: string): { level: number; text: string }[] {
	const out: { level: number; text: string }[] = [];
	let fenced = false;
	for (const line of markdown.split("\n")) {
		if (line.startsWith("```")) fenced = !fenced;
		const m = !fenced && /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
		if (m) out.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, "") });
	}
	return out;
}
