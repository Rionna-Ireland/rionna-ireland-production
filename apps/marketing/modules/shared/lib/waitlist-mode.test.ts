import { describe, expect, it } from "vitest";

import { isAllowedInWaitlistMode, isWaitlistOnly } from "./waitlist-mode";

const LOCALES = ["en", "de"];

describe("isWaitlistOnly", () => {
	it("is on while public signup is closed, off once it opens", () => {
		expect(isWaitlistOnly(false)).toBe(true);
		expect(isWaitlistOnly(true)).toBe(false);
	});
});

describe("isAllowedInWaitlistMode", () => {
	it.each([
		"/",
		"/waitlist",
		"/waitlist/",
		"/waitlist/unsubscribe",
		"/legal/privacy-policy",
		"/legal/terms",
		"/en",
		"/de/",
		"/de/waitlist/unsubscribe",
		"/de/legal/cookie-policy",
	])("allows %s", (path) => {
		expect(isAllowedInWaitlistMode(path, LOCALES)).toBe(true);
	});

	it.each([
		"/about",
		"/membership",
		"/news",
		"/news/some-post",
		"/events",
		"/contact",
		"/legal",
		"/waitlist/other",
		"/de/about",
		"/nope",
	])("blocks %s", (path) => {
		expect(isAllowedInWaitlistMode(path, LOCALES)).toBe(false);
	});
});
