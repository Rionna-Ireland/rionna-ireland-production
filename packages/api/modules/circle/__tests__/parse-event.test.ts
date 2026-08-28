import { describe, expect, it } from "vitest";

import { toClubEvent } from "../lib/parse-event";

const record = {
	id: 2,
	name: "Race day at Naas",
	body_plain_text: "Join us at Naas.",
	cover_image_url: "https://cdn.example/naas.jpg",
	url: "https://community.example/c/events/naas",
	space: { id: 42 },
	tiptap_body: {
		body: { type: "doc", content: [] },
		sgids_to_object_map: { a: { kind: "video" } },
		inline_attachments: [{ signed_id: "x" }],
	},
	event_setting_attributes: {
		starts_at: "2026-09-01T10:00:00Z",
		ends_at: "2026-09-01T14:00:00Z",
		location_type: "in_person",
		in_person_location: "Naas Racecourse",
		virtual_location_url: null,
		rsvp_disabled: false,
		rsvp_limit: 20,
		rsvp_count: 20,
	},
	rsvped_event: true,
	rsvp_status: "yes",
};

describe("toClubEvent", () => {
	it("maps the full record", () => {
		const event = toClubEvent(record);
		expect(event).toMatchObject({
			id: "2",
			spaceId: "42",
			title: "Race day at Naas",
			startsAt: "2026-09-01T10:00:00Z",
			inPersonLocation: "Naas Racecourse",
			coverImageUrl: "https://cdn.example/naas.jpg",
			rsvp: { going: true, status: "yes", count: 20, limit: 20, disabled: false, full: true },
		});
		expect(event?.tiptapDoc).toEqual({ type: "doc", content: [] });
		expect(event?.embeds).toEqual({ a: { kind: "video" } });
		expect(event?.inlineAttachments).toHaveLength(1);
	});
	it("reads the plural settings key as fallback", () => {
		const alt = {
			...record,
			event_setting_attributes: undefined,
			event_settings_attributes: record.event_setting_attributes,
		};
		expect(toClubEvent(alt)?.startsAt).toBe("2026-09-01T10:00:00Z");
	});
	it("returns null without id or title", () => {
		expect(toClubEvent({ name: "x" })).toBeNull();
		expect(toClubEvent({ id: 1 })).toBeNull();
	});
	it("is not full when limit is null", () => {
		const open = {
			...record,
			event_setting_attributes: {
				...record.event_setting_attributes,
				rsvp_limit: null,
				rsvp_count: 5,
			},
		};
		expect(toClubEvent(open)?.rsvp.full).toBe(false);
	});

	it("hides the location for a non-attendee when hide_location_from_non_attendees is set", () => {
		const hidden = {
			...record,
			event_setting_attributes: {
				...record.event_setting_attributes,
				hide_location_from_non_attendees: true,
			},
			rsvped_event: false,
		};
		const event = toClubEvent(hidden);
		expect(event?.inPersonLocation).toBeNull();
		expect(event?.virtualLocationUrl).toBeNull();
	});

	it("still shows the location to an RSVPed attendee even when hide_location_from_non_attendees is set", () => {
		const visible = {
			...record,
			event_setting_attributes: {
				...record.event_setting_attributes,
				hide_location_from_non_attendees: true,
			},
			rsvped_event: true,
		};
		const event = toClubEvent(visible);
		expect(event?.inPersonLocation).toBe("Naas Racecourse");
	});
});
