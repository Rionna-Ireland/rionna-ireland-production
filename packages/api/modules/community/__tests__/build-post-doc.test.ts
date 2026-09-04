import { describe, expect, it } from "vitest";

import { buildPostDoc } from "../lib/build-post-doc";

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

	it("appends an image node pointing at the media proxy path", () => {
		const content = buildPostDoc({ body: "x", imageKey: "community/o/m/a.jpg" }).content ?? [];
		expect(content[content.length - 1]).toEqual({
			type: "image",
			attrs: { src: "/image-proxy/media/community/o/m/a.jpg" },
		});
	});
});
