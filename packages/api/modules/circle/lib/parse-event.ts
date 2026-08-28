import { objectValue } from "./parse-post";

export interface ClubEventRsvp {
	going: boolean;
	status: string | null;
	count: number;
	limit: number | null;
	disabled: boolean;
	full: boolean;
}
export interface ClubEvent {
	id: string;
	spaceId: string | null;
	title: string;
	startsAt: string | null;
	endsAt: string | null;
	locationType: string | null;
	inPersonLocation: string | null;
	virtualLocationUrl: string | null;
	coverImageUrl: string | null;
	bodyText: string | null;
	tiptapDoc: Record<string, unknown> | null;
	embeds: Record<string, unknown>;
	inlineAttachments: Array<Record<string, unknown>>;
	url: string | null;
	rsvp: ClubEventRsvp;
}
export interface ClubEventsResult {
	ok: boolean;
	configured: boolean;
	events: ClubEvent[];
}

function str(v: unknown): string | null {
	return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * One Headless `community_events` record → the stable native shape. Circle's
 * concept doc names the settings key `event_settings_attributes` while the
 * live member payload uses `event_setting_attributes` — read both. Returns
 * null when the record lacks an id or title (defensive, mirrors toFeedItem).
 */
export function toClubEvent(record: Record<string, unknown>): ClubEvent | null {
	const id = record.id === undefined || record.id === null ? null : String(record.id);
	const title = str(record.name) ?? str(record.display_title);
	if (!id || !title) {
		return null;
	}
	const settings =
		objectValue(record.event_setting_attributes) ??
		objectValue(record.event_settings_attributes) ??
		{};
	const tiptap = objectValue(record.tiptap_body);
	const space = objectValue(record.space);
	const limit = num(settings.rsvp_limit);
	const count = num(settings.rsvp_count) ?? 0;
	const inlineAttachmentsRaw = tiptap?.inline_attachments;
	return {
		id,
		spaceId: space?.id === undefined || space.id === null ? null : String(space.id),
		title,
		startsAt: str(settings.starts_at),
		endsAt: str(settings.ends_at),
		locationType: str(settings.location_type),
		inPersonLocation: str(settings.in_person_location),
		virtualLocationUrl: str(settings.virtual_location_url),
		coverImageUrl: str(record.cover_image_url),
		bodyText: str(record.body_plain_text),
		tiptapDoc: objectValue(tiptap?.body) ?? null,
		embeds: objectValue(tiptap?.sgids_to_object_map) ?? {},
		inlineAttachments: Array.isArray(inlineAttachmentsRaw)
			? inlineAttachmentsRaw
					.map((a) => objectValue(a))
					.filter((a): a is Record<string, unknown> => a !== null && a !== undefined)
			: [],
		url: str(record.url),
		rsvp: {
			going: record.rsvped_event === true,
			status: str(record.rsvp_status),
			count,
			limit,
			disabled: settings.rsvp_disabled === true,
			full: limit !== null && count >= limit,
		},
	};
}
