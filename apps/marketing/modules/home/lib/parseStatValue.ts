export type ParsedStat = {
	prefix: string;
	number: number;
	decimals: number;
	suffix: string;
	grouping: boolean;
};

// First numeric run (digits, optional thousands commas, optional decimal) in admin free text.
const NUMERIC_RUN = /\d[\d,]*(?:\.\d+)?/;

/** Splits an admin stat like "€48k" for the count-up; null when there is no number (render static). */
export function parseStatValue(value: string): ParsedStat | null {
	const match = NUMERIC_RUN.exec(value);
	if (!match) return null;
	const raw = match[0];
	const number = Number(raw.replaceAll(",", ""));
	if (!Number.isFinite(number)) return null;
	return {
		prefix: value.slice(0, match.index),
		number,
		decimals: raw.split(".")[1]?.length ?? 0,
		suffix: value.slice(match.index + raw.length),
		grouping: raw.includes(","),
	};
}
