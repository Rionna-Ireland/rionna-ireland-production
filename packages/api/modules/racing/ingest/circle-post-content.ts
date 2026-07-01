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
}

export interface CirclePostContentEntry {
	finishingPosition: number | null;
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
		const body = `\u{1F3C7} ${horse.name} runs in the ${raceName} at ${courseName}, ${formatPostTime(race.postTime)}.`;
		return { title: `${horse.name} is declared`, body };
	}

	// status === "RAN"
	const pos = entry.finishingPosition;
	if (pos === 1) {
		const body = `\u{1F3C6} ${horse.name} won the ${raceName} at ${courseName}!`;
		return { title: `${horse.name} won!`, body };
	}
	if (pos != null) {
		const placeText =
			fieldSize != null
				? `finished ${toOrdinal(pos)} of ${fieldSize}`
				: `finished ${toOrdinal(pos)}`;
		const body = `${horse.name} ${placeText} in the ${raceName} at ${courseName}.`;
		return { title: `${horse.name} finished ${toOrdinal(pos)}`, body };
	}

	const body = `${horse.name} completed the ${raceName} at ${courseName}.`;
	return { title: `${horse.name} completed the race`, body };
}
