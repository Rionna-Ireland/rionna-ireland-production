import { describe, expect, it } from "vitest";

import {
	EMPTY_LAUNCH_FORM,
	launchFormSchema,
	recipientsForRun,
	toLaunchContent,
	toMaxToSend,
} from "./launch-form-values";

const VALID = {
	...EMPTY_LAUNCH_FORM,
	subject: " Rionna is live ",
	heading: "We're open",
	body: "Come and join.",
};

describe("launch form values", () => {
	it("accepts optional CTA and max-to-send left blank", () => {
		expect(launchFormSchema.safeParse(VALID).success).toBe(true);
	});

	it("rejects a malformed CTA URL and a non-positive max", () => {
		expect(launchFormSchema.safeParse({ ...VALID, ctaUrl: "not a url" }).success).toBe(false);
		expect(launchFormSchema.safeParse({ ...VALID, maxToSend: "0" }).success).toBe(false);
	});

	it("omits a blank ctaUrl and trims content", () => {
		expect(toLaunchContent(VALID)).toEqual({
			subject: "Rionna is live",
			heading: "We're open",
			body: "Come and join.",
		});
		expect(toLaunchContent({ ...VALID, ctaUrl: "https://rionna.ie" }).ctaUrl).toBe(
			"https://rionna.ie",
		);
	});

	it("maps maxToSend and caps the recipient count", () => {
		expect(toMaxToSend(VALID)).toBeUndefined();
		expect(toMaxToSend({ ...VALID, maxToSend: "50" })).toBe(50);
		expect(recipientsForRun(120, undefined)).toBe(120);
		expect(recipientsForRun(120, 50)).toBe(50);
		expect(recipientsForRun(20, 50)).toBe(20);
	});
});
