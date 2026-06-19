/**
 * Novel(TipTap) → Circle serializer tests (S2-09 slice 2)
 *
 * The serializer is the ISOLATED one-file layer that bridges our editor's
 * JSONContent to Circle's `tiptap_body` + post `attachments`. It is the only
 * place a Circle schema change touches, so these tests pin its contract:
 *  - text/marks pass through unchanged
 *  - image nodes are uploaded (bytes fetched via injected fn) and rewritten IN
 *    PLACE as a Circle inline image block `{ type:"image", attrs:{ signed_id,
 *    content_type, … } }` (post-level attachments do NOT render inline)
 *  - a videoUrl becomes one appended `embed` node carrying the Circle sgid
 *  - any upload/embed/fetch failure fails safe → { ok: false } (the procedure
 *    then surfaces the "post directly in Circle" fallback)
 */

import { serializeNovelDocToCircle } from "@repo/payments/lib/circle";
import type { SerializeDeps } from "@repo/payments/lib/circle";
import { describe, expect, it, vi } from "vitest";

function bytes(...n: number[]) {
	return new Uint8Array(n);
}

function makeDeps(overrides?: {
	uploadImage?: ReturnType<typeof vi.fn>;
	createEmbed?: ReturnType<typeof vi.fn>;
	fetchImageBytes?: ReturnType<typeof vi.fn>;
}) {
	const uploadImage =
		overrides?.uploadImage ??
		vi.fn().mockResolvedValue({ ok: true, data: { signedId: "signed-1" } });
	const createEmbed =
		overrides?.createEmbed ??
		vi.fn().mockResolvedValue({ ok: true, data: { sgid: "sgid-1", embedType: "video" } });
	const fetchImageBytes =
		overrides?.fetchImageBytes ??
		vi.fn().mockResolvedValue({
			data: bytes(1, 2, 3),
			contentType: "image/jpeg",
			filename: "a.jpg",
		});
	// Cast for the typed call; keep the raw mocks for assertions.
	const deps = {
		circle: { uploadImage, createEmbed },
		fetchImageBytes,
	} as unknown as SerializeDeps;
	return { deps, uploadImage, createEmbed, fetchImageBytes };
}

const PARA = (text: string) => ({
	type: "paragraph",
	content: [{ type: "text", text }],
});

// The Circle inline image block the serializer rewrites an image node into.
const IMG = (signedId: string, contentType = "image/jpeg") => ({
	type: "image",
	attrs: { signed_id: signedId, content_type: contentType, width: "100%", alignment: "center" },
});

describe("serializeNovelDocToCircle (S2-09)", () => {
	it("wraps a plain text doc unchanged with no attachments and no circle calls", async () => {
		const { deps, uploadImage, createEmbed } = makeDeps();
		const doc = { type: "doc" as const, content: [PARA("Pink Diamond Lass worked well.")] };

		const outcome = await serializeNovelDocToCircle(doc, {}, deps);

		if (!outcome.ok) throw new Error("expected ok");
		expect(outcome.tiptapBody).toEqual({
			body: { type: "doc", content: [PARA("Pink Diamond Lass worked well.")] },
		});
		expect(outcome.attachments).toEqual([]);
		expect(uploadImage).not.toHaveBeenCalled();
		expect(createEmbed).not.toHaveBeenCalled();
	});

	it("uploads an image node and rewrites it in place as an inline image block", async () => {
		const { deps, uploadImage, fetchImageBytes } = makeDeps();
		const doc = {
			type: "doc" as const,
			content: [
				PARA("Before"),
				{ type: "image", attrs: { src: "https://store/a.jpg" } },
				PARA("After"),
			],
		};

		const outcome = await serializeNovelDocToCircle(doc, {}, deps);

		if (!outcome.ok) throw new Error("expected ok");
		expect(outcome.attachments).toEqual([]);
		expect(outcome.tiptapBody.body.content).toEqual([
			PARA("Before"),
			IMG("signed-1"),
			PARA("After"),
		]);
		expect(fetchImageBytes).toHaveBeenCalledWith("https://store/a.jpg");
		expect(uploadImage).toHaveBeenCalledWith({
			filename: "a.jpg",
			contentType: "image/jpeg",
			data: bytes(1, 2, 3),
		});
	});

	it("uploads multiple images in document order, each rewritten in place", async () => {
		const uploadImage = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, data: { signedId: "signed-1" } })
			.mockResolvedValueOnce({ ok: true, data: { signedId: "signed-2" } });
		const { deps } = makeDeps({ uploadImage });
		const doc = {
			type: "doc" as const,
			content: [
				{ type: "image", attrs: { src: "https://store/a.jpg" } },
				PARA("Middle"),
				{ type: "image", attrs: { src: "https://store/b.jpg" } },
			],
		};

		const outcome = await serializeNovelDocToCircle(doc, {}, deps);

		if (!outcome.ok) throw new Error("expected ok");
		expect(outcome.attachments).toEqual([]);
		expect(outcome.tiptapBody.body.content).toEqual([
			IMG("signed-1"),
			PARA("Middle"),
			IMG("signed-2"),
		]);
		expect(uploadImage).toHaveBeenCalledTimes(2);
	});

	it("appends a single embed node for a videoUrl", async () => {
		const { deps, createEmbed } = makeDeps();
		const doc = { type: "doc" as const, content: [PARA("Watch the gallop:")] };

		const outcome = await serializeNovelDocToCircle(
			doc,
			{ videoUrl: "https://youtu.be/abc" },
			deps,
		);

		if (!outcome.ok) throw new Error("expected ok");
		expect(createEmbed).toHaveBeenCalledWith({ url: "https://youtu.be/abc" });
		expect(outcome.tiptapBody.body.content).toEqual([
			PARA("Watch the gallop:"),
			{ type: "embed", attrs: { sgid: "sgid-1" } },
		]);
	});

	it("combines image attachments and an appended video embed", async () => {
		const { deps } = makeDeps();
		const doc = {
			type: "doc" as const,
			content: [PARA("Update"), { type: "image", attrs: { src: "https://store/a.jpg" } }],
		};

		const outcome = await serializeNovelDocToCircle(
			doc,
			{ videoUrl: "https://youtu.be/abc" },
			deps,
		);

		if (!outcome.ok) throw new Error("expected ok");
		expect(outcome.attachments).toEqual([]);
		expect(outcome.tiptapBody.body.content).toEqual([
			PARA("Update"),
			IMG("signed-1"),
			{ type: "embed", attrs: { sgid: "sgid-1" } },
		]);
	});

	it("fails safe when an image upload fails", async () => {
		const uploadImage = vi
			.fn()
			.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });
		const { deps, createEmbed } = makeDeps({ uploadImage });
		const doc = {
			type: "doc" as const,
			content: [{ type: "image", attrs: { src: "https://store/a.jpg" } }],
		};

		const outcome = await serializeNovelDocToCircle(doc, {}, deps);

		expect(outcome).toMatchObject({ ok: false, reason: "server_error" });
		expect(createEmbed).not.toHaveBeenCalled();
	});

	it("fails safe when the video embed fails", async () => {
		const createEmbed = vi
			.fn()
			.mockResolvedValue({ ok: false, reason: "invalid_input", retriable: false });
		const { deps } = makeDeps({ createEmbed });
		const doc = { type: "doc" as const, content: [PARA("x")] };

		const outcome = await serializeNovelDocToCircle(
			doc,
			{ videoUrl: "https://youtu.be/abc" },
			deps,
		);

		expect(outcome).toMatchObject({ ok: false, reason: "invalid_input" });
	});

	it("fails safe when fetching image bytes throws", async () => {
		const fetchImageBytes = vi.fn().mockRejectedValue(new Error("404"));
		const { deps, uploadImage } = makeDeps({ fetchImageBytes });
		const doc = {
			type: "doc" as const,
			content: [{ type: "image", attrs: { src: "https://store/a.jpg" } }],
		};

		const outcome = await serializeNovelDocToCircle(doc, {}, deps);

		expect(outcome).toMatchObject({ ok: false, reason: "image_fetch_failed" });
		expect(uploadImage).not.toHaveBeenCalled();
	});
});
