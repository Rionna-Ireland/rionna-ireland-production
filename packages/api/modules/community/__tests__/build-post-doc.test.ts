import { describe, expect, it } from "vitest";

import { buildPostDoc } from "../lib/build-post-doc";
import type { MediaTokenPayload } from "../lib/media-token";

describe("buildPostDoc", () => {
	it("splits blank-line groups into paragraphs and single newlines into hardBreaks", () => {
		expect(buildPostDoc({ body: "Line one\nline two\n\nPara two" })).toEqual({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "Line one" },
						{ type: "hardBreak" },
						{ type: "text", text: "line two" },
					],
				},
				{ type: "paragraph", content: [{ type: "text", text: "Para two" }] },
			],
		});
	});

	it("normalizes CRLF line endings to match plain LF input", () => {
		expect(buildPostDoc({ body: "Line one\r\nline two\r\n\r\nPara two" })).toEqual(
			buildPostDoc({ body: "Line one\nline two\n\nPara two" }),
		);
	});

	it("auto-links URLs", () => {
		const doc = buildPostDoc({ body: "see https://rionna.com now" });
		expect(doc.content?.[0]).toEqual({
			type: "paragraph",
			content: [
				{ type: "text", text: "see " },
				{
					type: "text",
					text: "https://rionna.com",
					marks: [{ type: "link", attrs: { href: "https://rionna.com" } }],
				},
				{ type: "text", text: " now" },
			],
		});
	});

	it("appends image and video media nodes in order after the text", () => {
		const media = [
			{ kind: "image", signedId: "s1", cdnUrl: "https://c/1.jpg", contentType: "image/jpeg" },
			{ kind: "video", signedId: "s2", attachableSgid: "g2", cdnUrl: "https://c/2.mp4", contentType: "video/mp4" },
		] as MediaTokenPayload[];
		const content = buildPostDoc({ body: "x", media }).content ?? [];
		expect(content.slice(1)).toEqual([
			{ type: "image", attrs: { signedId: "s1", url: "https://c/1.jpg", contentType: "image/jpeg" } },
			{
				type: "embed",
				attrs: { signedId: "s2", attachableSgid: "g2", url: "https://c/2.mp4", contentType: "video/mp4" },
			},
		]);
	});
});
