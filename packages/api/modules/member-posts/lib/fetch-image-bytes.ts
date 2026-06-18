import type { SerializeImageBytes } from "@repo/payments/lib/circle";

/**
 * Read a stored image URL (Supabase/S3 public object) back to raw bytes so the
 * Circle serializer can push it through `direct_uploads` at publish time.
 * Throws on a non-ok response — the serializer turns that into a fail-safe
 * outcome ("post directly in Circle").
 */
export async function fetchImageBytes(src: string): Promise<SerializeImageBytes> {
	const res = await fetch(src);
	if (!res.ok) {
		throw new Error(`Image fetch failed (${res.status}) for ${src}`);
	}
	const data = new Uint8Array(await res.arrayBuffer());
	const contentType = res.headers.get("content-type") ?? "application/octet-stream";
	return { data, contentType, filename: filenameFromUrl(src) };
}

function filenameFromUrl(src: string): string {
	try {
		const last = new URL(src).pathname.split("/").pop();
		return last ? decodeURIComponent(last) : "image";
	} catch {
		return "image";
	}
}
