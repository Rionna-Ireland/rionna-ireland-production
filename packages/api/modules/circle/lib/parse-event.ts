import { decodeCircleInPersonLocation } from "@repo/payments/lib/circle";

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
	// Circle can hide the location from members who haven't RSVPed
	// (`hide_location_from_non_attendees`). The member payload marks the
	// viewer's own RSVP via `rsvped_event` — honor that here so a
	// non-attendee never sees the location leak through this mapper.
	const hideLocation = settings.hide_location_from_non_attendees === true;
	const isAttendee = record.rsvped_event === true;
	const locationHidden = hideLocation && !isAttendee;
	// Decode first (Circle stores/returns a JSON-encoded string), then apply
	// the hide-from-non-attendees rule — a member must never see the raw
	// JSON blob, and a hidden location must never leak through undecoded.
	const decodedInPersonLocation = decodeCircleInPersonLocation(str(settings.in_person_location));
	return {
		id,
		spaceId: space?.id === undefined || space.id === null ? null : String(space.id),
		title,
		startsAt: str(settings.starts_at),
		endsAt: str(settings.ends_at),
		locationType: str(settings.location_type),
		inPersonLocation: locationHidden ? null : decodedInPersonLocation,
		virtualLocationUrl: locationHidden ? null : str(settings.virtual_location_url),
		// Probed against staging (2026-08-28): the member API carries the cover as
		// top-level `cover_image` (plain URL) — `cover_image_url` is admin-side.
		coverImageUrl:
			str(record.cover_image_url) ?? str(record.cover_image) ?? str(record.cardview_image),
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
