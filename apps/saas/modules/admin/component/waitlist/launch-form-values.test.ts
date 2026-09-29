import { describe, expect, it } from "vitest";

import {
	DEFAULT_LAUNCH_PER_RUN,
	EMPTY_LAUNCH_FORM,
	launchFormSchema,
	MAX_LAUNCH_PER_RUN,
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

	it("rejects a malformed CTA URL and a max outside 1..MAX_LAUNCH_PER_RUN", () => {
		expect(launchFormSchema.safeParse({ ...VALID, ctaUrl: "not a url" }).success).toBe(false);
		expect(launchFormSchema.safeParse({ ...VALID, maxToSend: "0" }).success).toBe(false);
		expect(
			launchFormSchema.safeParse({ ...VALID, maxToSend: String(MAX_LAUNCH_PER_RUN) }).success,
		).toBe(true);
		expect(
			launchFormSchema.safeParse({ ...VALID, maxToSend: String(MAX_LAUNCH_PER_RUN + 1) })
				.success,
		).toBe(false);
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

	it("maps maxToSend (blank = default per-run cap) and caps the recipient count", () => {
		expect(toMaxToSend(VALID)).toBe(DEFAULT_LAUNCH_PER_RUN);
		expect(toMaxToSend({ ...VALID, maxToSend: "50" })).toBe(50);
		expect(recipientsForRun(1200, toMaxToSend(VALID))).toBe(DEFAULT_LAUNCH_PER_RUN);
		expect(recipientsForRun(120, 50)).toBe(50);
		expect(recipientsForRun(20, 50)).toBe(20);
	});
});
