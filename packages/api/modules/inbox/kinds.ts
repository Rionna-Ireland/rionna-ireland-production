/**
 * S12-06 notification centre: item kinds, how each is presented, and small
 * pure helpers shared by the writers and the list procedure.
 *
 * @see Architecture/specs/S12-06-notification-centre.md
 */

export const INBOX_KINDS = [
	"race_declared",
	"race_non_runner",
	"race_result",
	"horse_update",
	"news",
	"announcement",
	"inside_track",
	"event",
	"poll",
	"post_like",
	"post_comment",
	"horse_posts",
	"post_removed",
] as const;

export type InboxKind = (typeof INBOX_KINDS)[number];
export type InboxIcon = "horse" | "actor" | "club";

export type InboxDeepLink =
	| { screen: "horse"; horseId: string }
	| { screen: "news"; newsPostId: string }
	| { screen: "event"; eventId: string }
	| { screen: "poll"; pollId: string }
	| { screen: "insideTrack" }
	| { screen: "post"; spaceId: string; postId: string }
	| { screen: "spaceFeed"; spaceId: string };

/**
 * `bumpOnRegroup`: when a new event lands on an existing grouped row, does it
 * add to the unseen badge? Likes/comments are personal (yes); horse posts
 * re-surface the row but must not keep the bell lit (spec decision 12).
 */
export const KIND_META: Record<InboxKind, { icon: InboxIcon; bumpOnRegroup: boolean }> = {
	race_declared: { icon: "horse", bumpOnRegroup: false },
	race_non_runner: { icon: "horse", bumpOnRegroup: false },
	race_result: { icon: "horse", bumpOnRegroup: false },
	horse_update: { icon: "horse", bumpOnRegroup: false },
	news: { icon: "club", bumpOnRegroup: false },
	announcement: { icon: "club", bumpOnRegroup: false },
	inside_track: { icon: "club", bumpOnRegroup: false },
	event: { icon: "club", bumpOnRegroup: false },
	poll: { icon: "club", bumpOnRegroup: false },
	post_like: { icon: "actor", bumpOnRegroup: true },
	post_comment: { icon: "actor", bumpOnRegroup: true },
	horse_posts: { icon: "horse", bumpOnRegroup: false },
	post_removed: { icon: "club", bumpOnRegroup: false },
};

export function isInboxKind(value: string): value is InboxKind {
	return (INBOX_KINDS as readonly string[]).includes(value);
}

function actorPhrase(actorName: string | null, actorCount: number): string {
	const name = actorName?.trim() || "Someone";
	const others = actorCount - 1;
	if (others <= 0) return name;
	return `${name} and ${others} ${others === 1 ? "other" : "others"}`;
}

/** Grouped kinds are rendered at read time so one bulk update fits every row. */
export function presentInboxItem(row: {
	kind: string;
	title: string;
	body: string;
	actorName: string | null;
	actorCount: number;
}): { title: string; body: string } {
	const who = actorPhrase(row.actorName, row.actorCount);
	switch (row.kind) {
		case "post_like":
			return { title: `${who} liked your post`, body: row.body };
		case "post_comment":
			return { title: `${who} commented on your post`, body: row.body };
		case "horse_posts":
			return { title: row.title, body: `${who} posted` };
		default:
			return { title: row.title, body: row.body };
	}
}

export function dublinDateKey(now: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Dublin",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

export function firstPhotoUrl(photos: unknown): string | null {
	if (!Array.isArray(photos)) return null;
	const first = photos[0] as { url?: unknown } | undefined;
	return typeof first?.url === "string" && first.url.length > 0 ? first.url : null;
}
