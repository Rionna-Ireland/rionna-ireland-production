/**
 * Circle post content builder (S6-08)
 *
 * Pure content-config: given a race entry status transition, returns the
 * title/body to post into the horse's Circle space, or null when the
 * status shouldn't produce a Circle post. Kept separate from push-content.ts
 * (which drives mobile push copy) since the two surfaces read differently —
 * this one is copy meant to be read as a community post, not a notification.
 *
 * @see Architecture/specs/S6-08-circle-race-updates.md
 */

export interface CirclePostContentHorse {
	id: string;
	name: string;
}

export interface CirclePostContentRace {
	id: string;
	name: string | null;
	postTime: Date;
	courseName: string;
	distanceFurlongs: number | null;
	goingDescription: string | null;
}

export interface CirclePostContentEntry {
	finishingPosition: number | null;
	jockeyName: string | null;
}

export interface CirclePostContent {
	title: string;
	body: string;
}

type PostableStatus = "DECLARED" | "RAN";

const POSTABLE_STATUSES: PostableStatus[] = ["DECLARED", "RAN"];

function isPostableStatus(status: string): status is PostableStatus {
	return (POSTABLE_STATUSES as string[]).includes(status);
}

/** Furlongs -> "Xm Yf" race-going shorthand, e.g. 22 -> "2m6f", 7 -> "7f". */
export function formatDistance(furlongs: number): string {
	const miles = Math.floor(furlongs / 8);
	const remainder = furlongs % 8;
	if (miles === 0) return `${remainder}f`;
	if (remainder === 0) return `${miles}m`;
	return `${miles}m${remainder}f`;
}

function formatPostTime(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Europe/London",
	}).format(date);
}

function toOrdinal(n: number): string {
	const v = n % 100;
	if (v >= 11 && v <= 13) return `${n}th`;
	switch (n % 10) {
		case 1:
			return `${n}st`;
		case 2:
			return `${n}nd`;
		case 3:
			return `${n}rd`;
		default:
			return `${n}th`;
	}
}

/**
 * Builds the shared "details block" appended after the headline sentence:
 * an optional jockey clause (tense depends on status — "rides" for
 * DECLARED, "rode" for RAN) followed by an optional distance/going
 * sentence. Degrades gracefully when any piece is missing.
 */
function buildDetailsBlock(
	race: CirclePostContentRace,
	entry: CirclePostContentEntry,
	jockeyVerb: "rides" | "rode",
): string {
	let details = "";
	if (entry.jockeyName) {
		details += ` ${entry.jockeyName} ${jockeyVerb}.`;
	}
	const parts: string[] = [];
	if (race.distanceFurlongs != null) {
		parts.push(formatDistance(race.distanceFurlongs));
	}
	if (race.goingDescription) {
		parts.push(`going ${race.goingDescription}`);
	}
	if (parts.length > 0) {
		details += ` ${parts.join(", ")}.`;
	}
	return details;
}

export function buildCirclePostContent(
	status: string,
	horse: CirclePostContentHorse,
	race: CirclePostContentRace,
	entry: CirclePostContentEntry,
	fieldSize: number | undefined,
): CirclePostContent | null {
	if (!isPostableStatus(status)) return null;

	const raceName = race.name ?? "race";
	const courseName = race.courseName;

	if (status === "DECLARED") {
		const body = `\u{1F3C7} ${horse.name} runs in the ${raceName} at ${courseName}, ${formatPostTime(race.postTime)}.${buildDetailsBlock(race, entry, "rides")}`;
		return { title: `${horse.name} is declared`, body };
	}

	// status === "RAN"
	const pos = entry.finishingPosition;
	if (pos === 1) {
		const body = `\u{1F3C6} ${horse.name} won the ${raceName} at ${courseName}!${buildDetailsBlock(race, entry, "rode")}`;
		return { title: `${horse.name} won!`, body };
	}
	if (pos != null) {
		const placeText =
			fieldSize != null
				? `finished ${toOrdinal(pos)} of ${fieldSize}`
				: `finished ${toOrdinal(pos)}`;
		const body = `${horse.name} ${placeText} in the ${raceName} at ${courseName}.${buildDetailsBlock(race, entry, "rode")}`;
		return { title: `${horse.name} finished ${toOrdinal(pos)}`, body };
	}

	const body = `${horse.name} completed the ${raceName} at ${courseName}.${buildDetailsBlock(race, entry, "rode")}`;
	return { title: `${horse.name} completed the race`, body };
}

// --- Wellbeing cross-post (S8-01 Amendment A1) ------------------------------

export type CirclePostContentWellbeingType = "VET" | "TRAINING" | "REHAB" | "REST";

export interface CirclePostContentWellbeing {
	horseName: string;
	type: CirclePostContentWellbeingType;
	body: string;
}

const WELLBEING_TYPE_LABELS: Record<CirclePostContentWellbeingType, string> = {
	VET: "Vet",
	TRAINING: "Training",
	REHAB: "Rehab",
	REST: "Rest",
};

/**
 * S8-05 note: classification depends on this title shape — a stable
 * "<Horse> — wellbeing update: <Type>" prefix distinct from the
 * declaration/result templates above. Changing the shape needs a matching
 * change to S8-05's classifier + shared fixtures.
 */
export function buildWellbeingCirclePostContent(
	input: CirclePostContentWellbeing,
): CirclePostContent {
	const typeLabel = WELLBEING_TYPE_LABELS[input.type];
	return {
		title: `${input.horseName} — wellbeing update: ${typeLabel}`,
		body: input.body,
	};
}
