export type Chapter = { id: string; label: string; index: number };

/** About chapters in order; the people chapter drops out (and numbering closes up) without founders. */
export function chapterNumbering(hasFounders: boolean): Chapter[] {
	const all = [
		{ id: "story", label: "Our story" },
		{ id: "why", label: "Why we exist" },
		{ id: "club", label: "The club" },
		...(hasFounders ? [{ id: "people", label: "The people" }] : []),
		{ id: "believe", label: "What we believe" },
	];
	return all.map((c, i) => ({ ...c, index: i + 1 }));
}
