/**
 * Europe/Dublin wall-clock formatting for admin exports (S12-10 / S12-09).
 * Spreadsheet readers in Ireland expect local time; the explicit offset keeps
 * the value unambiguous across the IST/GMT switch.
 */

const DUBLIN_TIME_ZONE = "Europe/Dublin";

const dublinFormatter = new Intl.DateTimeFormat("en-GB", {
	timeZone: DUBLIN_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hourCycle: "h23",
	timeZoneName: "longOffset",
});

function dublinParts(date: Date): Record<string, string> {
	const parts: Record<string, string> = {};
	for (const part of dublinFormatter.formatToParts(date)) {
		parts[part.type] = part.value;
	}
	return parts;
}

/** ISO 8601 in Europe/Dublin with offset, e.g. `2026-09-27T14:05:00+01:00`. */
export function formatDublinIso(date: Date): string {
	const p = dublinParts(date);
	// `longOffset` renders "GMT+01:00", or plain "GMT" at UTC+0.
	const offset = p.timeZoneName?.replace("GMT", "") || "+00:00";
	return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
}

/** Calendar date in Europe/Dublin, e.g. `2026-09-27` (for export filenames). */
export function formatDublinDate(date: Date): string {
	const p = dublinParts(date);
	return `${p.year}-${p.month}-${p.day}`;
}
