import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CircleTiptapRenderer } from "../CircleTiptapRenderer";
import type { HydratedNode } from "@repo/payments/lib/circle/hydrate";

const render = (doc: HydratedNode) => renderToStaticMarkup(<CircleTiptapRenderer doc={doc} />);

describe("CircleTiptapRenderer", () => {
	it("renders a strikethrough mark (fixes the read divergence)", () => {
		const html = render({
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "gone", marks: [{ type: "strike" }] }] },
			],
		});
		expect(html).toMatch(/<(s|del)>gone<\/(s|del)>/);
	});

	it("honors image alignment on read (fixes the read divergence)", () => {
		const html = render({
			type: "doc",
			content: [{ type: "image", attrs: { url: "https://x/i.jpg", alignment: "right" } }],
		});
		expect(html).toContain('data-align="right"');
		expect(html).toContain("float-right");
	});

	it("renders a read-only poll: question + all options", () => {
		const html = render({
			type: "doc",
			content: [
				{
					type: "poll",
					attrs: {
						sgid: "X",
						_resolved: {
							title: "Who is amazing",
							status: "active",
							poll_options: [
								{ id: 1, value: "Me" },
								{ id: 2, value: "Him" },
							],
						},
					},
				},
			],
		});
		expect(html).toContain("Who is amazing");
		expect(html).toContain("Me");
		expect(html).toContain("Him");
	});

	it("never throws on an unknown node", () => {
		expect(() =>
			render({ type: "doc", content: [{ type: "someFutureBlock", content: [] }] }),
		).not.toThrow();
	});
});

describe("CircleTiptapRenderer embed sanitization (Kimi H3)", () => {
	const embedDoc = (html: string): HydratedNode => ({
		type: "doc",
		content: [
			{
				type: "embed",
				attrs: { sgid: "X", _resolved: { html, url: "https://provider.example/watch" } },
			},
		],
	});

	it("rebuilds an iframe embed from its validated https src (no raw HTML pass-through)", () => {
		const html = render(
			embedDoc('<iframe src="https://www.youtube.com/embed/abc" data-tracker="spy"></iframe>'),
		);
		expect(html).toContain('src="https://www.youtube.com/embed/abc"');
		expect(html).not.toContain("data-tracker");
	});

	it("renders a script-only embed as a safe link, never as HTML", () => {
		const html = render(embedDoc('<script>alert(1)</script>'));
		expect(html).not.toContain("<script");
		expect(html).toContain("View media");
		expect(html).toContain('href="https://provider.example/watch"');
	});

	it("renders a javascript: iframe src as a safe link", () => {
		const html = render(embedDoc('<iframe src="javascript:alert(1)"></iframe>'));
		expect(html).not.toContain("javascript:");
		expect(html).toContain("View media");
	});
});

describe("CircleTiptapRenderer native video (file block)", () => {
	it("renders a video/quicktime file node as an inline player", () => {
		const html = render({
			type: "doc",
			content: [
				{
					type: "file",
					attrs: {
						sgid: "F1",
						_resolved: {
							url: "https://assets-v2.circle.so/capturedvideo.MOV",
							content_type: "video/quicktime",
							filename: "capturedvideo.MOV",
						},
					},
				},
			],
		});
		expect(html).toContain("<video");
		expect(html).toContain('src="https://assets-v2.circle.so/capturedvideo.MOV"');
		expect(html.toLowerCase()).toContain("playsinline");
	});

	it("renders a non-video file as a download link", () => {
		const html = render({
			type: "doc",
			content: [
				{
					type: "file",
					attrs: {
						sgid: "F2",
						_resolved: {
							url: "https://assets-v2.circle.so/notes.pdf",
							content_type: "application/pdf",
							filename: "notes.pdf",
						},
					},
				},
			],
		});
		expect(html).not.toContain("<video");
		expect(html).toContain("notes.pdf");
		expect(html).toContain('href="https://assets-v2.circle.so/notes.pdf"');
	});
});
