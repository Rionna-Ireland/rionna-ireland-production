import { describe, expect, it } from "vitest";

import { extractEmbedIframeSrc } from "../embed-html";

describe("extractEmbedIframeSrc", () => {
	it("extracts the src of an https iframe", () => {
		expect(
			extractEmbedIframeSrc(
				'<iframe src="https://www.youtube.com/embed/abc123" width="640" height="360" frameborder="0" allowfullscreen></iframe>',
			),
		).toBe("https://www.youtube.com/embed/abc123");
	});

	it("extracts a single-quoted src", () => {
		expect(extractEmbedIframeSrc("<iframe src='https://player.vimeo.com/video/1'></iframe>")).toBe(
			"https://player.vimeo.com/video/1",
		);
	});

	it("rejects javascript: URLs", () => {
		expect(extractEmbedIframeSrc('<iframe src="javascript:alert(1)"></iframe>')).toBeNull();
	});

	it("rejects non-https URLs", () => {
		expect(extractEmbedIframeSrc('<iframe src="http://evil.example/x"></iframe>')).toBeNull();
	});

	it("rejects HTML with no iframe (script payloads)", () => {
		expect(extractEmbedIframeSrc('<script>alert(1)</script>')).toBeNull();
		expect(extractEmbedIframeSrc('<img src=x onerror="alert(1)">')).toBeNull();
	});

	it("decodes entity-encoded ampersands in the src", () => {
		expect(
			extractEmbedIframeSrc(
				'<iframe src="https://www.youtube.com/embed/a?start=1&amp;end=2"></iframe>',
			),
		).toBe("https://www.youtube.com/embed/a?start=1&end=2");
	});

	it("returns null for empty or missing input", () => {
		expect(extractEmbedIframeSrc("")).toBeNull();
		expect(extractEmbedIframeSrc("<iframe></iframe>")).toBeNull();
	});
});
