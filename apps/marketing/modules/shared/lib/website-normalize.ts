export type JoinMode = "waitlist" | "signup";

export interface WebsiteFounder {
	name: string;
	role: string;
	bio: string;
	photoUrl?: string;
}

export interface WebsiteContent {
	hero: {
		eyebrow?: string;
		title?: string;
		subtitle?: string;
		imageUrl?: string;
		videoUrl?: string;
	};
	featuredHorseIds: string[];
	stats: { value: string; label: string }[];
	membership: {
		price?: string;
		interval?: string;
		note?: string;
		inclusions: string[];
		faq: { question: string; answer: string }[];
	};
	about: { storyTitle?: string; photoUrl?: string; founders: WebsiteFounder[] };
	/** Default "signup" so the launch env flip alone opens Join. */
	joinMode: JoinMode;
}

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj =>
	v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => {
	const s = typeof v === "string" ? v.trim() : "";
	return s || undefined;
};
const strings = (v: unknown): string[] => arr(v).flatMap((x) => str(x) ?? []);

/** Optional string fields: trimmed, blanks dropped. */
function pickStrings<K extends string>(src: Obj, keys: readonly K[]): { [P in K]?: string } {
	const out: { [P in K]?: string } = {};
	for (const k of keys) {
		const s = str(src[k]);
		if (s) out[k] = s;
	}
	return out;
}

/** Items where every required key is a non-blank string; optional keys kept when non-blank. */
function items<R extends string, O extends string>(
	v: unknown,
	required: readonly R[],
	optional: readonly O[] = [],
): ({ [P in R]: string } & { [P in O]?: string })[] {
	return arr(v).flatMap((raw) => {
		const o = obj(raw);
		const req = pickStrings(o, required);
		if (required.some((k) => !req[k])) return [];
		return [
			{ ...req, ...pickStrings(o, optional) } as { [P in R]: string } & { [P in O]?: string },
		];
	});
}

/** Defensive read of `metadata.website`; never throws, empty slot = use fallback or hide. */
export function normalizeWebsite(raw: unknown): WebsiteContent {
	const w = obj(raw);
	const membership = obj(w.membership);
	const about = obj(w.about);
	return {
		hero: pickStrings(obj(w.hero), ["eyebrow", "title", "subtitle", "imageUrl", "videoUrl"]),
		featuredHorseIds: strings(w.featuredHorseIds),
		stats: items(w.stats, ["value", "label"]),
		membership: {
			...pickStrings(membership, ["price", "interval", "note"]),
			inclusions: strings(membership.inclusions),
			faq: items(membership.faq, ["question", "answer"]),
		},
		about: {
			...pickStrings(about, ["storyTitle", "photoUrl"]),
			founders: items(about.founders, ["name", "role", "bio"], ["photoUrl"]),
		},
		joinMode: w.joinMode === "waitlist" ? "waitlist" : "signup",
	};
}

/** Featured ids in admin order, dropping any no longer public; falls back to the first N. */
export function pickFeaturedHorses<T extends { id: string }>(
	publicHorses: T[],
	featuredIds: string[],
	fallbackCount = 4,
): T[] {
	const byId = new Map(publicHorses.map((h) => [h.id, h]));
	const picked = featuredIds.flatMap((id) => byId.get(id) ?? []);
	return picked.length > 0 ? picked : publicHorses.slice(0, fallbackCount);
}
