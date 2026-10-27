import type { FeedChip } from "@repo/api/modules/community/lib/types";

export type SpaceTagTone =
	| "horses"
	| "official"
	| "news"
	| "charity"
	| "polls"
	| "community"
	| "unknown";

const NAME_RULES: { tone: SpaceTagTone; pattern: RegExp }[] = [
	{ tone: "official", pattern: /official|announcement/ },
	{ tone: "news", pattern: /news/ },
	{ tone: "charity", pattern: /charit/ },
	{ tone: "polls", pattern: /poll/ },
	{
		tone: "community",
		pattern:
			/introduc|network|new to racing|lifestyle|general|community|social|racing|welcome|chat/,
	},
];

/** Horse spaces come from the "Horses" chip; it is the source of truth. */
export function horseSpaceIds(chips: FeedChip[] | undefined): Set<string> {
	const ids = new Set<string>();
	for (const chip of chips ?? []) {
		if (chip.kind === "horses") for (const id of chip.spaceIds) ids.add(id);
	}
	return ids;
}

export function spaceTagTone(
	spaceName: string | null | undefined,
	spaceId?: string | null,
	horseIds?: ReadonlySet<string>,
): SpaceTagTone {
	if (spaceId && horseIds?.has(spaceId)) return "horses";
	const name = (spaceName ?? "").trim().toLowerCase();
	return NAME_RULES.find((rule) => rule.pattern.test(name))?.tone ?? "unknown";
}

/** Pill fill and text classes per tone (Design V2 tokens). */
export const SPACE_TAG_CLASS: Record<SpaceTagTone, string> = {
	horses: "bg-sage text-forest",
	official: "bg-ink text-white",
	news: "bg-ice text-ink",
	charity: "bg-forest/15 text-forest",
	polls: "bg-lilac-light text-plum",
	community: "bg-lilac-light/60 text-plum-mid",
	unknown: "bg-cream text-ink-variant",
};

export type RelativeTime =
	| { kind: "justNow" }
	| { kind: "minutesAgo" | "hoursAgo" | "daysAgo"; count: number }
	| { kind: "date"; text: string };

/** Compact relative time; past a week it falls back to a short date. */
export function relativeTime(
	value: string | null | undefined,
	now: number = Date.now(),
): RelativeTime | null {
	if (!value) return null;
	const then = Date.parse(value);
	if (Number.isNaN(then)) return null;
	const minutes = Math.floor(Math.max(0, now - then) / 60_000);
	if (minutes < 1) return { kind: "justNow" };
	if (minutes < 60) return { kind: "minutesAgo", count: minutes };
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return { kind: "hoursAgo", count: hours };
	const days = Math.floor(hours / 24);
	if (days < 7) return { kind: "daysAgo", count: days };
	return {
		kind: "date",
		text: new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short" }).format(
			new Date(then),
		),
	};
}

/** Role badge: an expert shows their own free-text tag when set. */
export function roleBadge(
	role: "trainer" | "expert" | "staff" | null | undefined,
	label?: string | null,
): { role: "trainer" | "expert" | "staff"; customLabel: string | null } | null {
	if (!role) return null;
	const custom = role === "expert" ? label?.trim() || null : null;
	return { role, customLabel: custom };
}

/** Story card link target; null when the marketing site URL isn't configured. */
export function storyHref(slug: string, marketingUrl: string | undefined): string | null {
	if (!marketingUrl) return null;
	return `${marketingUrl.replace(/\/$/, "")}/news/${encodeURIComponent(slug)}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Thursday 8pm" (viewer's local time); null for an unparseable date. */
export function formatFeaturedWhen(startsAt: string): string | null {
	const d = new Date(startsAt);
	if (Number.isNaN(d.getTime())) return null;
	const h = d.getHours();
	const m = d.getMinutes();
	const hour = h % 12 === 0 ? 12 : h % 12;
	const clock = `${hour}${m === 0 ? "" : `:${String(m).padStart(2, "0")}`}${h >= 12 ? "pm" : "am"}`;
	return `${WEEKDAYS[d.getDay()]} ${clock}`;
}

/** Questions thread when the event has one; null otherwise (no web event page). */
export function featuredHref(
	basePath: string,
	card: { questionsPostId?: string; questionsSpaceId?: string },
): string | null {
	if (!card.questionsPostId || !card.questionsSpaceId) return null;
	return `${basePath}/feed/${encodeURIComponent(card.questionsSpaceId)}/${encodeURIComponent(card.questionsPostId)}`;
}
