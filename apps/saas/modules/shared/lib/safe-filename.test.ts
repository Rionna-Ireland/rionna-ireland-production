/**
 * toSafeFilename (S5-09 Task 3.3, audit F3) — client-side mirror of the API's
 * SAFE_FILENAME rule (/^[\w][\w.\-]{0,120}$/). Real user filenames (spaces,
 * unicode, leading dots) must be coerced into something the hardened upload-URL
 * procedures accept, never rejected outright.
 */

import { describe, expect, it } from "vitest";

import { toSafeFilename } from "./safe-filename";

const SAFE_FILENAME = /^[\w][\w.-]{0,120}$/;

describe("toSafeFilename (S5-09 / F3)", () => {
	it("passes an already-safe filename through unchanged", () => {
		expect(toSafeFilename("photo-2.png")).toBe("photo-2.png");
	});

	it("replaces whitespace and unsafe characters", () => {
		expect(toSafeFilename("my photo (1).png")).toBe("my-photo-1-.png");
	});

	it("strips a leading dot", () => {
		expect(toSafeFilename(".hidden.png")).toBe("hidden.png");
	});

	it("falls back to a non-empty name", () => {
		expect(toSafeFilename("")).toBe("file");
		expect(toSafeFilename("···")).toBe("file");
	});

	it.each(["my photo (1).png", "café au lait.jpeg", ".hidden", `${"x".repeat(300)}.png`, "a/b.png"])(
		"always produces a server-accepted filename for %s",
		(name) => {
			const out = toSafeFilename(name);
			expect(SAFE_FILENAME.test(out)).toBe(true);
			// leave headroom for a `${Date.now()}-` prefix at the call sites
			expect(`${Date.now()}-${out}`.length).toBeLessThanOrEqual(121);
		},
	);
});
