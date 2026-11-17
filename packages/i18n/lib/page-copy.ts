import marketingDefaults from "../translations/en/marketing.json";

/** S17-09: admin overrides of marketing copy, keyed by dotted message path. */
export type PageCopy = Record<string, string>;

export const PAGE_COPY_MAX_LENGTH = 3000;

// Owned by Admin → Website (its value wins over the message), so not editable here.
const WEBSITE_FORM_KEYS = [
	"home.hero.eyebrow",
	"home.hero.title",
	"home.hero.subtitle",
	"about.title",
	"membership.plan.price",
	"membership.plan.interval",
	"membership.plan.priceNote",
];
const WEBSITE_FORM_PREFIXES = [
	"membership.plan.features.",
	"membership.faq.items.",
	// Wireframe-mode placeholder page, never shown to visitors.
	"membership.wireframe.",
];

export function isEditableKey(key: string): boolean {
	return !WEBSITE_FORM_KEYS.includes(key) && !WEBSITE_FORM_PREFIXES.some((p) => key.startsWith(p));
}

export function flattenMessages(obj: unknown, prefix = ""): PageCopy {
	const out: PageCopy = {};
	if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
	for (const [k, v] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${k}` : k;
		if (typeof v === "string") out[path] = v;
		else Object.assign(out, flattenMessages(v, path));
	}
	return out;
}

/** Every editable marketing string with its built-in default. */
export const marketingCopyDefaults: PageCopy = Object.fromEntries(
	Object.entries(flattenMessages(marketingDefaults)).filter(([k]) => isEditableKey(k)),
);

/** ICU placeholders/plurals (`{name}`) and rich-text tags (`<b>`, `</b>`); next-intl throws if these drift. */
export function copyTokens(text: string): string[] {
	const tokens = [
		...(text.match(/\{\s*[\w]+/g) ?? []).map((t) => t.replace(/\s/g, "")),
		...(text.match(/<\/?[\w-]+\s*\/?>/g) ?? []),
	];
	return tokens.sort();
}

/**
 * Keeps only real edits: known editable keys, non-blank, different from the default.
 * `invalid` lists keys whose placeholders/tags don't match the default.
 */
export function cleanPageCopy(
	input: Record<string, unknown>,
	defaults: PageCopy = marketingCopyDefaults,
): { pageCopy: PageCopy; invalid: string[] } {
	const pageCopy: PageCopy = {};
	const invalid: string[] = [];
	for (const [key, raw] of Object.entries(input)) {
		const def = defaults[key];
		if (def === undefined || typeof raw !== "string") continue;
		const value = raw.trim();
		if (!value || value === def) continue;
		if (copyTokens(value).join() !== copyTokens(def).join()) {
			invalid.push(key);
			continue;
		}
		pageCopy[key] = value;
	}
	return { pageCopy, invalid };
}

/** Returns a copy of `messages` with the overrides applied; unknown or malformed entries are ignored. */
export function applyPageCopy<T>(messages: T, overrides: unknown): T {
	if (!overrides || typeof overrides !== "object") return messages;
	const { pageCopy } = cleanPageCopy(overrides as Record<string, unknown>);
	const keys = Object.keys(pageCopy);
	if (keys.length === 0) return messages;
	const out = structuredClone(messages) as Record<string, unknown>;
	for (const key of keys) {
		const parts = key.split(".");
		let node = out;
		for (const p of parts.slice(0, -1)) node = node[p] as Record<string, unknown>;
		node[parts[parts.length - 1]] = pageCopy[key];
	}
	return out as T;
}
