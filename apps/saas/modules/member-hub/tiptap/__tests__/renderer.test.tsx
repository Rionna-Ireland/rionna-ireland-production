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
