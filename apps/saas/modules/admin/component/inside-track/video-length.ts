/**
 * S13-13: Inside Track "Video length (minutes)" field <-> stored seconds.
 * Admins think in minutes (decimals allowed, e.g. 4.5); the API stores whole
 * seconds. Blank clears the override.
 */

export const MAX_VIDEO_MINUTES = 24 * 60;

export function secondsToMinutesInput(seconds: number | null | undefined): string {
	if (!seconds || seconds <= 0) return "";
	return String(Math.round((seconds / 60) * 100) / 100);
}

/** `undefined` = invalid input, `null` = cleared, number = whole seconds. */
export function minutesInputToSeconds(raw: string): number | null | undefined {
	const trimmed = raw.trim();
	if (trimmed === "") return null;
	const minutes = Number(trimmed);
	if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_VIDEO_MINUTES) return undefined;
	return Math.max(1, Math.round(minutes * 60));
}
