import { describe, expect, it } from "vitest";
import { hydrateCircleDoc, type HydratedNode } from "../hydrate";

const POLL_SGID = "BAh7CEkiCGdpZAY6BkVUSSIvZ2lkOi8vanVtcHN0YXJ0LWFwcC9Qb2xsLzE0MjQ1NQ==--abc";

const POLL_BODY = {
	body: {
		type: "doc",
		content: [{ type: "poll", attrs: { sgid: POLL_SGID } }],
	},
	sgids_to_object_map: {
		[POLL_SGID]: {
			type: "poll",
			id: 142455,
			title: "Who is amazing",
			status: "active",
			poll_options: [
				{ id: 618560, value: "Me" },
				{ id: 618561, value: "Him" },
			],
		},
	},
};

function firstChild(doc: HydratedNode | null): HydratedNode {
	if (!doc?.content?.[0]) throw new Error("no first child");
	return doc.content[0];
}

describe("hydrateCircleDoc", () => {
	it("returns null for a doc with no content", () => {
		expect(hydrateCircleDoc({ body: { type: "doc", content: [] } })).toBeNull();
		expect(hydrateCircleDoc(null)).toBeNull();
	});

	it("resolves a poll node's object from sgids_to_object_map onto attrs._resolved", () => {
		const poll = firstChild(hydrateCircleDoc(POLL_BODY));
		expect(poll.type).toBe("poll");
		const resolved = poll.attrs?._resolved as { title: string; poll_options: unknown[] };
		expect(resolved.title).toBe("Who is amazing");
		expect(resolved.poll_options).toHaveLength(2);
	});

	it("resolves an embed node's oEmbed object by sgid", () => {
		const doc = hydrateCircleDoc({
			body: { type: "doc", content: [{ type: "embed", attrs: { sgid: "S1" } }] },
			sgids_to_object_map: { S1: { html: "<iframe></iframe>", url: "https://x", embed_type: "video" } },
		});
		const embed = firstChild(doc);
		const resolved = embed.attrs?._resolved as { html: string };
		expect(resolved.html).toContain("iframe");
	});

	it("resolves an image via attrs.url (fast path)", () => {
		const doc = hydrateCircleDoc({
			body: {
				type: "doc",
				content: [{ type: "image", attrs: { url: "https://cdn/x.jpg", signed_id: "sig1" } }],
			},
		});
		const img = firstChild(doc);
		expect(img.attrs?.url).toBe("https://cdn/x.jpg");
	});

	it("resolves an image by matching inline_attachments on signed_id", () => {
		const doc = hydrateCircleDoc({
			body: { type: "doc", content: [{ type: "image", attrs: { signed_id: "sig1" } }] },
			inline_attachments: [{ signed_id: "sig1", url: "https://cdn/from-attachment.jpg" }],
		});
		const img = firstChild(doc);
		expect(img.attrs?.url).toBe("https://cdn/from-attachment.jpg");
		const resolved = img.attrs?._resolved as { signed_id: string };
		expect(resolved.signed_id).toBe("sig1");
	});

	it("leaves plain nodes untouched and recurses into children", () => {
		const doc = hydrateCircleDoc({
			body: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
			},
		});
		const p = firstChild(doc);
		expect(p.type).toBe("paragraph");
		expect(p.content?.[0]?.text).toBe("hi");
	});
});
