/**
 * decodeCircleInPersonLocation (S11-02 live-QA fix)
 *
 * Circle requires `in_person_location` to be written as a JSON-encoded
 * string (`{ address }`) and returns it verbatim on read — this decoder is
 * the single place that turns it back into a human-readable address. Must
 * tolerate legacy/plain-string values and any shape Circle doesn't document.
 */
import { describe, expect, it } from "vitest";

import { decodeCircleInPersonLocation } from "../location";

describe("decodeCircleInPersonLocation", () => {
	it("returns null for null input", () => {
		expect(decodeCircleInPersonLocation(null)).toBeNull();
	});

	it("decodes a JSON object with an address field", () => {
		expect(decodeCircleInPersonLocation(JSON.stringify({ address: "Naas Racecourse" }))).toBe(
			"Naas Racecourse",
		);
	});

	it("decodes a JSON-encoded bare string", () => {
		expect(decodeCircleInPersonLocation(JSON.stringify("Naas Racecourse"))).toBe(
			"Naas Racecourse",
		);
	});

	it("tolerates a plain legacy string that isn't JSON", () => {
		expect(decodeCircleInPersonLocation("Naas Racecourse")).toBe("Naas Racecourse");
	});

	it("falls back to the raw string on unparseable JSON (garbage input)", () => {
		expect(decodeCircleInPersonLocation("{not json")).toBe("{not json");
	});

	it("falls back to the raw string for a JSON shape with no address field", () => {
		const raw = JSON.stringify({ lat: 53.1, lng: -6.6 });
		expect(decodeCircleInPersonLocation(raw)).toBe(raw);
	});
});
