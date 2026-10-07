import { describe, expect, it } from "vitest";

import { deriveAgeYears, deriveProfileLine, withHorseFacts } from "../horse-facts";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("deriveAgeYears (racing convention: increments on 1 January)", () => {
	it("a 2023 foal is 3 throughout 2026, regardless of foaling day", () => {
		for (const now of ["2026-01-01T00:00:00Z", "2026-06-15T12:00:00Z", "2026-12-31T23:59:59Z"]) {
			expect(deriveAgeYears(d("2023-12-30"), new Date(now))).toBe(3);
			expect(deriveAgeYears(d("2023-01-02"), new Date(now))).toBe(3);
		}
	});

	it("ticks over on 1 January, not on the birthday", () => {
		const foaled = d("2023-12-30");
		expect(deriveAgeYears(foaled, new Date("2026-12-31T23:59:59Z"))).toBe(3);
		expect(deriveAgeYears(foaled, new Date("2027-01-01T00:00:00Z"))).toBe(4);
	});

	it("is null without a date, with garbage, or with a future foaling year", () => {
		expect(deriveAgeYears(null)).toBeNull();
		expect(deriveAgeYears(undefined)).toBeNull();
		expect(deriveAgeYears("nope")).toBeNull();
		expect(deriveAgeYears(d("2030-01-01"), new Date("2026-06-01"))).toBeNull();
	});

	it("accepts ISO strings (serialised payloads)", () => {
		expect(deriveAgeYears("2023-02-21", new Date("2026-10-07"))).toBe(3);
	});
});

describe("deriveProfileLine", () => {
	it("composes the full line", () => {
		expect(deriveProfileLine({ colour: "Bay", sex: "FILLY", ageYears: 3 })).toBe(
			"Bay filly, 3 years old",
		);
	});

	it("omits missing parts", () => {
		expect(deriveProfileLine({ colour: "Bay", sex: "FILLY", ageYears: null })).toBe("Bay filly");
		expect(deriveProfileLine({ colour: null, sex: "COLT", ageYears: 2 })).toBe("Colt, 2 years old");
		expect(deriveProfileLine({ colour: "Grey", sex: null, ageYears: 4 })).toBe("Grey, 4 years old");
		expect(deriveProfileLine({ colour: null, sex: null, ageYears: 5 })).toBe("5 years old");
		expect(deriveProfileLine({ colour: " ", sex: null, ageYears: null })).toBeNull();
		expect(deriveProfileLine({})).toBeNull();
	});

	it("singular year and no age for a foal of the year", () => {
		expect(deriveProfileLine({ sex: "MARE", ageYears: 1 })).toBe("Mare, 1 year old");
		expect(deriveProfileLine({ sex: "MARE", ageYears: 0 })).toBe("Mare");
	});

	it("ignores an unknown sex value", () => {
		expect(deriveProfileLine({ colour: "Bay", sex: "???", ageYears: 3 })).toBe("Bay, 3 years old");
	});
});

describe("withHorseFacts", () => {
	it("adds ageYears and profileLine and keeps the rest", () => {
		const out = withHorseFacts(
			{ id: "h", colour: "Bay", sex: "FILLY", foaledOn: d("2023-02-21") },
			new Date("2026-10-07"),
		);
		expect(out).toMatchObject({ id: "h", ageYears: 3, profileLine: "Bay filly, 3 years old" });
	});

	it("is null/null for a horse with no facts", () => {
		expect(withHorseFacts({ colour: null, sex: null, foaledOn: null })).toMatchObject({
			ageYears: null,
			profileLine: null,
		});
	});
});
