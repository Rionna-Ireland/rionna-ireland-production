import { describe, expect, it } from "vitest";

import { isAllowedInWaitlistMode, isStaticMediaPath, isWaitlistOnly } from "./waitlist-mode";

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
		"/preview",
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

describe("isStaticMediaPath", () => {
	it.each([
		"/hero/a.mp4",
		"/media/about/x.mp4",
		"/app-screens/1.webp",
		"/store-badges/a.svg",
		"/patterns/p.svg",
	])("gates %s", (p) => expect(isStaticMediaPath(p)).toBe(true));
	it.each(["/mediaX", "/media", "/about", "/en/hero/a.mp4"])("ignores %s", (p) =>
		expect(isStaticMediaPath(p)).toBe(false),
	);
});
