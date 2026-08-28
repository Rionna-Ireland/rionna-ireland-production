/**
 * Circle `in_person_location` codec.
 *
 * Probed against staging (2026-08-27): Circle's Admin API v2 requires
 * `event_setting_attributes.in_person_location` to be a JSON-encoded string
 * (e.g. `JSON.stringify({ address: "Naas Racecourse" })`) — a plain string
 * 400s with "in person location data should be in json format". Circle
 * stores and returns that JSON string verbatim on reads (member + admin
 * APIs), so every read path must decode it back to a human address.
 */

/**
 * Decode a raw `in_person_location` value from Circle into a human-readable
 * address. Tolerant of legacy/plain-string values (pre-fix data, or any
 * shape Circle doesn't document) — anything that isn't recognisably our JSON
 * envelope is returned as-is rather than dropped.
 */
export function decodeCircleInPersonLocation(raw: string | null): string | null {
	if (raw === null) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// Not JSON — legacy/plain string, tolerate it verbatim.
		return raw;
	}

	if (typeof parsed === "string") return parsed;

	if (
		parsed !== null &&
		typeof parsed === "object" &&
		typeof (parsed as { address?: unknown }).address === "string"
	) {
		return (parsed as { address: string }).address;
	}

	// Parsed JSON but not a shape we recognise — fall back to the raw string
	// rather than surfacing something unreadable.
	return raw;
}
