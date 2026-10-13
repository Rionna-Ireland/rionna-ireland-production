/**
 * S13-11: club event categories. Events are Circle-only, so the type lives in
 * the `ClubEventMeta` sidecar. Kept free of DB imports so the admin UI can
 * import the labels.
 */
export const EVENT_TYPES = ["RACE_DAY", "STABLE_VISIT", "SOCIAL", "QA", "OTHER"] as const;
export type EventTypeValue = (typeof EVENT_TYPES)[number];

/**
 * Human labels. Mobile (S13-05) reads `event.type` as a display string and
 * matches /race/ and /stable/ case-insensitively, so the API serves the label
 * as `type` and the raw enum as `eventType`.
 */
export const EVENT_TYPE_LABELS: Record<EventTypeValue, string> = {
	RACE_DAY: "Race Day",
	STABLE_VISIT: "Stable Visit",
	SOCIAL: "Social",
	QA: "Q&A",
	OTHER: "Other",
};

export function isEventType(value: unknown): value is EventTypeValue {
	return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}
