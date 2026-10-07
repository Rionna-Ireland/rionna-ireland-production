/**
 * S13-10: server-derived horse facts shared by every member-facing horse
 * payload (list, detail, following), so mobile and web render identically.
 */

const SEX_WORDS: Record<string, string> = {
	FILLY: "filly",
	COLT: "colt",
	MARE: "mare",
	GELDING: "gelding",
	STALLION: "stallion",
};

/**
 * Racing-convention age: every horse's age increments on 1 January, so a
 * 2023 foal is 3 throughout 2026 (irrespective of the actual foaling day).
 * `null` without a foaling date or for an impossible (future) one.
 */
export function deriveAgeYears(
	foaledOn: Date | string | null | undefined,
	now: Date = new Date(),
): number | null {
	if (!foaledOn) return null;
	const d = typeof foaledOn === "string" ? new Date(foaledOn) : foaledOn;
	if (Number.isNaN(d.getTime())) return null;
	// `foaledOn` is a calendar date stored at UTC midnight.
	const age = now.getUTCFullYear() - d.getUTCFullYear();
	return age >= 0 ? age : null;
}

/**
 * "Bay filly, 3 years old". Missing parts are omitted ("Filly, 3 years old",
 * "Bay filly", "3 years old"); `null` when nothing is known. A foal of the
 * current year (age 0) has no age part.
 */
export function deriveProfileLine(horse: {
	colour?: string | null;
	sex?: string | null;
	ageYears?: number | null;
}): string | null {
	const colour = horse.colour?.trim() || null;
	const sex = horse.sex ? (SEX_WORDS[horse.sex] ?? null) : null;
	const kind = [colour, sex].filter(Boolean).join(" ");
	const age =
		horse.ageYears != null && horse.ageYears > 0
			? `${horse.ageYears} ${horse.ageYears === 1 ? "year" : "years"} old`
			: null;
	const parts = [kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : null, age].filter(Boolean);
	return parts.length > 0 ? parts.join(", ") : null;
}

/** Adds `ageYears` + `profileLine` to a horse row. */
export function withHorseFacts<
	T extends { colour?: string | null; sex?: string | null; foaledOn?: Date | string | null },
>(horse: T, now: Date = new Date()): T & { ageYears: number | null; profileLine: string | null } {
	const ageYears = deriveAgeYears(horse.foaledOn, now);
	return {
		...horse,
		ageYears,
		profileLine: deriveProfileLine({ colour: horse.colour, sex: horse.sex, ageYears }),
	};
}
