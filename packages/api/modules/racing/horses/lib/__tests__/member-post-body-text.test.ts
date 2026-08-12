import { describe, expect, it } from "vitest";

import { bodyTextFromJson } from "../member-post-body-text";

describe("bodyTextFromJson", () => {
	it("joins text nodes within a paragraph", () => {
		const doc = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "Hello " },
						{ type: "text", text: "world" },
					],
				},
			],
		};
		expect(bodyTextFromJson(doc)).toBe("Hello world");
	});

	it("separates top-level blocks with a blank line", () => {
		const doc = {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "First para" }] },
				{ type: "paragraph", content: [{ type: "text", text: "Second para" }] },
			],
		};
		expect(bodyTextFromJson(doc)).toBe("First para\n\nSecond para");
	});

	it("skips non-text nodes (e.g. images/embeds) with no text content", () => {
		const doc = {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "Caption" }] },
				{ type: "image", attrs: { src: "https://example.com/x.jpg" } },
			],
		};
		expect(bodyTextFromJson(doc)).toBe("Caption");
	});

	it("recurses into nested content (e.g. bullet list items)", () => {
		const doc = {
			type: "doc",
			content: [
				{
					type: "bulletList",
					content: [
						{
							type: "listItem",
							content: [
								{
									type: "paragraph",
									content: [{ type: "text", text: "Item one" }],
								},
							],
						},
					],
				},
			],
		};
		expect(bodyTextFromJson(doc)).toBe("Item one");
	});

	it("returns an empty string for empty, missing, or malformed docs", () => {
		expect(bodyTextFromJson(undefined)).toBe("");
		expect(bodyTextFromJson(null)).toBe("");
		expect(bodyTextFromJson({})).toBe("");
		expect(bodyTextFromJson({ type: "doc", content: [] })).toBe("");
		expect(bodyTextFromJson("not an object")).toBe("");
	});

	it("drops blank/whitespace-only blocks", () => {
		const doc = {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "   " }] },
				{ type: "paragraph", content: [{ type: "text", text: "Real content" }] },
			],
		};
		expect(bodyTextFromJson(doc)).toBe("Real content");
	});
});
