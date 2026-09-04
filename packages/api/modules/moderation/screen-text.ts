import { BASE_BLOCKED_WORDS } from "./blocked-words";

export interface ScreenResult {
	allowed: boolean;
	matches: string[];
}

const LEET: Record<string, string> = {
	"@": "a",
	"0": "o",
	"1": "i",
	"3": "e",
	$: "s",
	"!": "i",
	"4": "a",
	"5": "s",
	"7": "t",
};

export function normalize(input: string): string {
	let s = input
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "");
	s = s.replace(/[@0134$!57]/g, (c) => LEET[c] ?? c);
	// collapse single-char runs separated by . _ - or spaces: "f.u.c.k" / "f u c k" → "fuck"
	s = s.replace(/\b(?:[a-z][._\-\s]){2,}[a-z]\b/g, (m) => m.replace(/[._\-\s]/g, ""));
	s = s.replace(/([a-z])\1{2,}/g, "$1"); // fuuuck → fuck; runs of 3+ only, so "ss" (run of 2) survives
	return s;
}

function toPhraseRegex(term: string): RegExp {
	const escaped = normalize(term)
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\s+/g, "\\s+");
	return new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`, "i");
}

export function screenText(text: string, extraBlockedWords: string[] = []): ScreenResult {
	if (!text.trim()) return { allowed: true, matches: [] };
	const norm = normalize(text);
	const matches = new Set<string>();
	for (const term of [...BASE_BLOCKED_WORDS, ...extraBlockedWords]) {
		if (term.trim() && toPhraseRegex(term).test(norm)) matches.add(term.toLowerCase());
	}
	const result = [...matches];
	return { allowed: result.length === 0, matches: result };
}
