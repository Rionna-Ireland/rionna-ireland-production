/**
 * fetchImageBytes tests (S2-09 slice 2; SSRF hardening S5-09 Task 3.3, audit F4)
 *
 * Reads a stored image URL back to raw bytes so the serializer can push it to
 * Circle's direct_uploads at publish time. Derives a filename from the URL and
 * a content-type from the response (with a safe fallback); throws on non-ok so
 * the serializer's fail-safe path engages.
 *
 * Absolute URLs are fetched server-side at publish time, so only the app's own
 * origins are allowed: the Supabase public-bucket host and the app's base URL.
 * Anything else (external hosts, cloud metadata endpoints) must throw without
 * a fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSignedUrl } = vi.hoisted(() => ({ mockGetSignedUrl: vi.fn() }));

vi.mock("@repo/storage", () => ({ getSignedUrl: mockGetSignedUrl }));

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

beforeEach(() => {
	vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://store.example");
	vi.stubEnv("NEXT_PUBLIC_SAAS_URL", "https://club.example");
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.clearAllMocks();
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

describe("fetchImageBytes — SSRF hardening (S5-09 / F4)", () => {
	it("rejects an absolute URL on a foreign origin without fetching", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(fetchImageBytes("https://evil.example/steal.png")).rejects.toThrow();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects the cloud metadata endpoint without fetching", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			fetchImageBytes("http://169.254.169.254/latest/meta-data/iam/"),
		).rejects.toThrow();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects a subdomain lookalike of an allowed origin", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			fetchImageBytes("https://store.example.evil.example/a.png"),
		).rejects.toThrow();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("signs an app-origin absolute image-proxy URL instead of fetching it raw", async () => {
		mockGetSignedUrl.mockResolvedValue("https://store.example/signed/a.png?sig=1");
		const fetchMock = vi
			.fn()
			.mockResolvedValue(response(200, new Uint8Array([7]), "image/png"));
		vi.stubGlobal("fetch", fetchMock);

		const out = await fetchImageBytes("https://club.example/image-proxy/media/org1/a.png");

		expect(mockGetSignedUrl).toHaveBeenCalledWith("org1/a.png", {
			bucket: "media",
			expiresIn: 60,
		});
		expect(fetchMock).toHaveBeenCalledWith("https://store.example/signed/a.png?sig=1");
		expect(out.contentType).toBe("image/png");
	});

	it("still signs a relative image-proxy URL", async () => {
		mockGetSignedUrl.mockResolvedValue("https://store.example/signed/b.png?sig=1");
		const fetchMock = vi
			.fn()
			.mockResolvedValue(response(200, new Uint8Array([8]), "image/png"));
		vi.stubGlobal("fetch", fetchMock);

		await fetchImageBytes("/image-proxy/media/org1/b.png");

		expect(mockGetSignedUrl).toHaveBeenCalledWith("org1/b.png", {
			bucket: "media",
			expiresIn: 60,
		});
		expect(fetchMock).toHaveBeenCalledWith("https://store.example/signed/b.png?sig=1");
	});
});
