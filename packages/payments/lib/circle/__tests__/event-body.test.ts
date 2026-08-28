import { describe, expect, it } from "vitest";

import { tiptapDocToTrixBody } from "../event-body";

function doc(paragraphs: string[]) {
	return {
		body: {
			type: "doc" as const,
			content: paragraphs.map((text) => ({
				type: "paragraph",
				content: [{ type: "text", text }],
			})),
		},
	};
}

describe("tiptapDocToTrixBody", () => {
	it("emits one div per non-empty paragraph", () => {
		expect(tiptapDocToTrixBody(doc(["Line one.", "Line two."]))).toBe(
			"<div>Line one.</div><div>Line two.</div>",
		);
	});

	it("escapes HTML special characters", () => {
		expect(tiptapDocToTrixBody(doc(['Badges & <passes> at "the" gate'])) as string).toBe(
			"<div>Badges &amp; &lt;passes&gt; at &quot;the&quot; gate</div>",
		);
	});

	it("skips empty paragraphs and returns null for an empty doc", () => {
		expect(tiptapDocToTrixBody(doc(["", "   ", "Kept."]))).toBe("<div>Kept.</div>");
		expect(tiptapDocToTrixBody(doc([]))).toBeNull();
		expect(
			tiptapDocToTrixBody({ body: { type: "doc", content: [{ type: "paragraph" }] } }),
		).toBeNull();
	});

	it("joins multiple text nodes within a paragraph", () => {
		const mixed = {
			body: {
				type: "doc" as const,
				content: [
					{
						type: "paragraph",
						content: [
							{ type: "text", text: "Hello " },
							{ type: "hardBreak" },
							{ type: "text", text: "world" },
						],
					},
				],
			},
		};
		expect(tiptapDocToTrixBody(mixed)).toBe("<div>Hello world</div>");
	});
});
