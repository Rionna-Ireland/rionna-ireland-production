export type Chapter = { id: string; index: number };

/** About chapters in order (labels come from i18n); the people chapter drops out, and numbering closes up, without founders. */
export function chapterNumbering(hasFounders: boolean): Chapter[] {
	const ids = ["story", "why", "club", ...(hasFounders ? ["people"] : []), "believe"];
	return ids.map((id, i) => ({ id, index: i + 1 }));
}
