/** Marketing message namespaces, in the order admins see them, with their public path. */
export const PAGES = [
	{ id: "home", path: "/" },
	{ id: "about", path: "/about" },
	{ id: "membership", path: "/membership" },
	{ id: "appPage", path: "/app" },
	{ id: "news", path: "/news" },
	{ id: "events", path: "/events" },
	{ id: "waitlist", path: "/waitlist" },
	{ id: "contact", path: "/contact" },
	{ id: "common", path: "/" },
	{ id: "legal", path: "/legal/terms" },
	{ id: "notFound", path: undefined },
	{ id: "preview", path: undefined },
] as const;

export type PageId = (typeof PAGES)[number]["id"];

/** "liveRaceData" / "plan features" → "Live race data" / "Plan features". */
export function humanize(path: string): string {
	const words = path
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[._-]+/g, " ")
		.trim()
		.toLowerCase()
		.replace(/\bcta\b/g, "button")
		.replace(/\baria\b/g, "screen reader labels");
	return (words.charAt(0).toUpperCase() + words.slice(1)).replace(/\bfaq\b/gi, "FAQ");
}

/** Groups keys by their first two segments (`home.features`), keeping file order. */
export function groupCopy(keys: string[]): { id: string; keys: string[] }[] {
	const groups = new Map<string, string[]>();
	for (const key of keys) {
		const parts = key.split(".");
		const id = parts.length > 2 ? parts.slice(0, 2).join(".") : parts[0];
		groups.set(id, [...(groups.get(id) ?? []), key]);
	}
	return [...groups].map(([id, keys]) => ({ id, keys }));
}

/** Website slots shown inside the text section they belong to on the page. */
const INLINE_BLOCKS: Record<string, string[]> = {
	"home.hero": ["hero"],
	"home.horses": ["horses"],
	"membership.plan": ["plan"],
	"membership.faq": ["faq"],
	about: ["aboutStory"],
};

/** Slots with no text of their own get a section, placed after `after` (or at the top). */
const EXTRA_SECTIONS: { page: PageId; id: string; blocks: string[]; after?: string }[] = [
	{ page: "home", id: "stats", blocks: ["stats"], after: "home.horses" },
	{ page: "about", id: "people", blocks: ["founders"], after: "about.chapters" },
	{ page: "common", id: "join", blocks: ["joinMode"] },
	{ page: "common", id: "share", blocks: ["share"] },
];

export interface PageSection {
	id: string;
	keys: string[];
	blocks: string[];
	/** Extra sections have no text keys; their title comes from admin.pageCopy.sections. */
	extra?: boolean;
}

/** A page's sections in order: text groups with their slots, plus slot-only sections. */
export function layoutPage(page: PageId, keys: string[]): PageSection[] {
	const sections: PageSection[] = groupCopy(keys).map((g) => ({
		...g,
		blocks: INLINE_BLOCKS[g.id] ?? [],
	}));
	let top = 0;
	for (const extra of EXTRA_SECTIONS.filter((e) => e.page === page)) {
		const after = extra.after ? sections.findIndex((s) => s.id === extra.after) : -1;
		const at = after >= 0 ? after + 1 : top++;
		sections.splice(at, 0, { id: extra.id, keys: [], blocks: extra.blocks, extra: true });
	}
	return sections;
}
