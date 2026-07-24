/**
 * Upload validation helpers (S5-09 Task 3.3, audit F3) — presigned upload-URL
 * procedures must cap client-declared image sizes at 10 MB and reject filenames
 * that could traverse or pollute storage keys. Plain S3 presigns can't enforce a
 * Content-Length range, so the size cap is app-side (honest-client) validation
 * backed by bucket-level limits.
 */

import { describe, expect, it } from "vitest";

import {
	MAX_IMAGE_UPLOAD_BYTES,
	SAFE_FILENAME,
	assertSafeFilename,
} from "../upload-validation";

describe("SAFE_FILENAME (S5-09 / F3)", () => {
	it.each([
		"photo.png",
		"1720000000000-horse_pic-2.jpeg",
		"a",
		"logo.svg",
		"IMG_0042.HEIC",
	])("accepts %s", (name) => {
		expect(SAFE_FILENAME.test(name)).toBe(true);
	});

	it.each([
		["../../etc/passwd", "path traversal"],
		["..%2f..%2fetc%2fpasswd", "encoded traversal"],
		["sub/dir.png", "path separator"],
		[".hidden", "leading dot"],
		["-flag.png", "leading dash"],
		["my photo.png", "whitespace"],
		["", "empty"],
		[`${"a".repeat(122)}.png`, "over 121 chars"],
		["café.png", "non-ASCII"],
	])("rejects %s (%s)", (name) => {
		expect(SAFE_FILENAME.test(name)).toBe(false);
	});
});

describe("assertSafeFilename (S5-09 / F3)", () => {
	it("throws BAD_REQUEST for an unsafe filename", () => {
		try {
			assertSafeFilename("../../evil.png");
			expect.unreachable("assertSafeFilename must throw");
		} catch (e) {
			expect(e).toMatchObject({ code: "BAD_REQUEST", message: "Invalid filename" });
		}
	});

	it("passes a safe filename through", () => {
		expect(() => assertSafeFilename("photo.png")).not.toThrow();
	});
});

describe("MAX_IMAGE_UPLOAD_BYTES (S5-09 / F3)", () => {
	it("caps images at 10 MB", () => {
		expect(MAX_IMAGE_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
	});
});
