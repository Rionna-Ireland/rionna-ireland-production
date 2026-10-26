import { describe, expect, it } from "vitest";

import { resolveStoreLinks } from "./store-links";

describe("resolveStoreLinks", () => {
	it("falls back to temporary links when unset", () => {
		const { ios, android } = resolveStoreLinks(undefined);
		expect(ios).toEqual({ href: "https://apps.apple.com/", temporary: true });
		expect(android).toEqual({ href: "https://play.google.com/store/apps", temporary: true });
	});

	it("resolves each store independently", () => {
		const { ios, android } = resolveStoreLinks({ iosUrl: "https://apps.apple.com/app/x" });
		expect(ios).toEqual({ href: "https://apps.apple.com/app/x", temporary: false });
		expect(android.temporary).toBe(true);
	});

	it("treats blank strings as unset", () => {
		const { ios, android } = resolveStoreLinks({ iosUrl: "  ", androidUrl: "" });
		expect(ios.temporary).toBe(true);
		expect(android.temporary).toBe(true);
	});
});
