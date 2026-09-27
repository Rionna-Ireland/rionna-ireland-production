import { afterEach, describe, expect, it } from "vitest";

import { isPublicSignupOpen } from "../signup-open";

const original = process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;

afterEach(() => {
	if (original === undefined) {
		delete process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
	} else {
		process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN = original;
	}
});

describe("isPublicSignupOpen", () => {
	it("defaults to closed", () => {
		delete process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
		expect(isPublicSignupOpen()).toBe(false);
	});

	it("is open only for the exact string 'true'", () => {
		process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN = "true";
		expect(isPublicSignupOpen()).toBe(true);
		process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN = "1";
		expect(isPublicSignupOpen()).toBe(false);
	});
});
