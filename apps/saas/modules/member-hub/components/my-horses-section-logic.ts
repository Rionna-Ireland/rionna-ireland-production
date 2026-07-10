/**
 * "My horses" dashboard section logic (S8-03 §4).
 *
 * Pure, framework-free helpers the section + card lean on: optimistic follow
 * cache updates, the "hide when nothing to follow" rule, per-row pending
 * checks, and the horse-card formatting (photo, pedigree, result rows) that
 * mirrors mobile Stables (`result-row.tsx`, `next-entry-card.tsx`).
 */

export interface FollowableHorse {
	id: string;
	name: string;
	isFollowing: boolean;
}

/**
 * Optimistically flips one horse's follow state in a cached list, leaving the
 * rest untouched. Generic over `T` so it can be applied directly to the real
 * (wider) query cache shape — not just the `FollowableHorse` view — without
 * losing any fields the cache carries.
 */
export function applyFollowToggle<T extends { id: string; isFollowing: boolean }>(
	horses: T[] | undefined,
	horseId: string,
	isFollowing: boolean,
): T[] | undefined {
	return horses?.map((horse) => (horse.id === horseId ? { ...horse, isFollowing } : horse));
}

/** How many of the org's published horses the member currently follows. */
export function countFollowing(horses: FollowableHorse[] | undefined): number {
	return (horses ?? []).filter((horse) => horse.isFollowing).length;
}

/** No published horses at all → nothing to follow, hide the section entirely. */
export function shouldHideSection(isLoading: boolean, horses: FollowableHorse[] | undefined): boolean {
	return !isLoading && (!horses || horses.length === 0);
}

/** Whether a follow/unfollow mutation is in flight for this specific horse row. */
export function isPendingForHorse(
	mutation: { isPending: boolean; variables?: { horseId: string } | undefined },
	horseId: string,
): boolean {
	return mutation.isPending && mutation.variables?.horseId === horseId;
}

export interface HorsePhoto {
	url: string;
	caption?: string;
}

/** First photo's URL, or null if the horse has no photos (or the field is malformed). */
export function firstPhotoUrl(photos: unknown): string | null {
	if (!Array.isArray(photos) || photos.length === 0) {
		return null;
	}
	const first = photos[0] as HorsePhoto | undefined;
	return first?.url ?? null;
}

export interface HorsePedigree {
	sire?: string | null;
	dam?: string | null;
	damsire?: string | null;
}

export interface PedigreeLine {
	label: "sire" | "dam" | "damsire";
	name: string;
}

/** Pedigree fields present on the horse, in sire/dam/damsire order. */
export function pedigreeLines(pedigree: unknown): PedigreeLine[] {
	if (!pedigree || typeof pedigree !== "object") {
		return [];
	}
	const { sire, dam, damsire } = pedigree as HorsePedigree;
	const lines: PedigreeLine[] = [];
	if (sire) lines.push({ label: "sire", name: sire });
	if (dam) lines.push({ label: "dam", name: dam });
	if (damsire) lines.push({ label: "damsire", name: damsire });
	return lines;
}

/** Furlongs -> "Xm Yf" shorthand, e.g. 22 -> "2m6f", 7 -> "7f" (mirrors mobile). */
export function formatDistance(furlongs: number): string {
	const miles = Math.floor(furlongs / 8);
	const remainder = furlongs % 8;
	if (miles === 0) return `${remainder}f`;
	if (remainder === 0) return `${miles}m`;
	return `${miles}m${remainder}f`;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", etc. */
export function getOrdinal(position: number): string {
	const suffixes = ["th", "st", "nd", "rd"];
	const remainder = position % 100;
	const suffix = suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0];
	return `${position}${suffix}`;
}

export interface RaceResultEntry {
	finishingPosition?: number | null;
	jockey?: { name: string } | null;
	race?: {
		name?: string | null;
		distanceFurlongs?: number | null;
		goingDescription?: string | null;
		postTime?: string | Date | null;
		meeting?: { course?: { name?: string | null } | null } | null;
	} | null;
}

/** "jockey · distance · going" detail line, mirroring mobile's `result-row.tsx`. */
export function formatResultDetail(entry: RaceResultEntry): string {
	const race = entry.race;
	const parts = [
		entry.jockey?.name ?? null,
		race?.distanceFurlongs != null ? formatDistance(race.distanceFurlongs) : null,
		race?.goingDescription ?? null,
	].filter((part): part is string => Boolean(part));
	return parts.join(" · ");
}

/** Up to `limit` recent results for a horse, most recent first (source already ordered). */
export function recentResults<T>(entries: T[] | undefined, limit = 3): T[] {
	return (entries ?? []).slice(0, limit);
}

export interface NextRunEntry {
	horseId: string;
}

/** Whether the org-wide "next run" entry belongs to this horse. */
export function isNextRunForHorse(
	nextRun: NextRunEntry | null | undefined,
	horseId: string,
): boolean {
	return nextRun?.horseId === horseId;
}
