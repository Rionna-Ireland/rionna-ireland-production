/**
 * fetchImageBytes tests (S2-09 slice 2)
 *
 * Reads a stored image URL back to raw bytes so the serializer can push it to
 * Circle's direct_uploads at publish time. Derives a filename from the URL and
 * a content-type from the response (with a safe fallback); throws on non-ok so
 * the serializer's fail-safe path engages.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchImageBytes } from "../lib/fetch-image-bytes";

function response(status: number, bytes: Uint8Array, contentType: string | null) {
	return {
		ok: status >= 200 && status < 300,
		status,
		arrayBuffer: async () => bytes.buffer,
		headers: {
			get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null),
		},
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchImageBytes (S2-09)", () => {
	it("returns bytes, content-type and a URL-decoded filename", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(response(200, new Uint8Array([1, 2, 3]), "image/png")),
		);

		const out = await fetchImageBytes(
			"https://store.example/org1/member-posts/lass%20gallop.png?token=abc",
		);

		expect(Array.from(out.data)).toEqual([1, 2, 3]);
		expect(out.contentType).toBe("image/png");
		expect(out.filename).toBe("lass gallop.png");
	});

	it("falls back to application/octet-stream when no content-type header", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200, new Uint8Array([9]), null)));

		const out = await fetchImageBytes("https://store.example/a.bin");

		expect(out.contentType).toBe("application/octet-stream");
		expect(out.filename).toBe("a.bin");
	});

	it("throws on a non-ok response (engages the serializer fail-safe)", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(404, new Uint8Array(), null)));

		await expect(fetchImageBytes("https://store.example/missing.png")).rejects.toThrow();
	});
});
