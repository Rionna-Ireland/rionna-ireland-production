import { describe, expect, it } from "vitest";

import { charityFormSchema, formatEuro, toCharityFormValues, toCharityPayload } from "./charity-form-values";

const CONFIG = {
	id: "c1", charityName: "IIJ", description: "d", logoUrl: null, websiteUrl: "https://iij.ie",
	percentage: "5" as unknown as number, startDate: new Date("2026-03-01T00:00:00.000Z"), goalCents: 3_600_000,
	manualOverrideCents: null, pollId: "p1",
};

describe("toCharityFormValues", () => {
	it("maps cents to euro strings, dates to yyyy-mm-dd, nulls to empty", () => {
		expect(toCharityFormValues(CONFIG)).toEqual({
			charityName: "IIJ", description: "d", logoUrl: "", websiteUrl: "https://iij.ie", percentage: 5,
			startDate: "2026-03-01", goalEuro: "36000", overrideEuro: "", pollId: "p1",
		});
	});
});

describe("toCharityPayload", () => {
	it("maps euro strings to integer cents and blanks to null", () => {
		expect(toCharityPayload({ charityName: "IIJ", description: "d", logoUrl: "", websiteUrl: "", percentage: 2.5, startDate: "2026-03-01", goalEuro: "36000.50", overrideEuro: "", pollId: "" })).toEqual({
			charityName: "IIJ", description: "d", logoUrl: null, websiteUrl: null, percentage: 2.5,
			startDate: "2026-03-01T00:00:00.000Z", goalCents: 3_600_050, manualOverrideCents: null, pollId: null,
		});
	});
	it("treats an override of 0 as a real override", () => {
		expect(toCharityPayload({ charityName: "x", description: "d", logoUrl: "", websiteUrl: "", percentage: 5, startDate: "2026-03-01", goalEuro: "", overrideEuro: "0", pollId: "" }).manualOverrideCents).toBe(0);
	});
});

describe("charityFormSchema", () => {
	const base = { charityName: "IIJ", description: "d", logoUrl: "", startDate: "2026-03-01", percentage: 5, goalEuro: "", overrideEuro: "", pollId: "" };

	it("rejects a websiteUrl missing its scheme", () => {
		expect(charityFormSchema.safeParse({ ...base, websiteUrl: "iij.ie" }).success).toBe(false);
	});
	it("accepts an empty websiteUrl", () => {
		expect(charityFormSchema.safeParse({ ...base, websiteUrl: "" }).success).toBe(true);
	});
	it("accepts a full websiteUrl", () => {
		expect(charityFormSchema.safeParse({ ...base, websiteUrl: "https://iij.ie" }).success).toBe(true);
	});
	it("rejects a percentage with more than 2 decimal places", () => {
		expect(charityFormSchema.safeParse({ ...base, websiteUrl: "", percentage: 5.001 }).success).toBe(false);
	});
	it("rejects a percentage outside 0-100", () => {
		expect(charityFormSchema.safeParse({ ...base, websiteUrl: "", percentage: 100.01 }).success).toBe(false);
	});
});

describe("formatEuro", () => {
	it("formats cents as a euro amount with thousands separators", () => {
		expect(formatEuro(2_450_000)).toBe("€24,500.00");
		expect(formatEuro(0)).toBe("€0.00");
	});
});
