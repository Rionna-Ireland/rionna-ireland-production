import type { SerializeImageBytes } from "@repo/payments/lib/circle";
import { getSignedUrl } from "@repo/storage";
import { config as storageConfig } from "@repo/storage/config";

const ALLOWED_BUCKETS = ["avatars", "media"] as const;
type LogicalBucket = (typeof ALLOWED_BUCKETS)[number];

// Matches the in-app proxy URLs stored on image nodes: `/image-proxy/{bucket}/{key...}`.
const PROXY_RE = /^\/image-proxy\/([^/]+)\/(.+)$/;

function resolveLogicalBucket(segment: string): LogicalBucket | undefined {
	return ALLOWED_BUCKETS.find(
		(key) => key === segment || storageConfig.bucketNames[key] === segment,
	);
}

/**
 * Resolve a stored image `src` to a directly fetchable URL. Images are stored as
 * relative `/image-proxy/{bucket}/{key}` URLs pointing at a PRIVATE bucket, so we
 * sign a short-lived GET server-side (a bare `fetch` of the relative path would
 * throw, and the bucket isn't publicly readable). Absolute URLs pass through.
 */
async function resolveFetchUrl(src: string): Promise<string> {
	const match = src.match(PROXY_RE);
	if (!match) {
		return src;
	}
	const [, bucketSegment, filePath] = match;
	const bucket = bucketSegment ? resolveLogicalBucket(bucketSegment) : undefined;
	if (!bucket || !filePath) {
		throw new Error(`Unresolvable image-proxy URL: ${src}`);
	}
	return await getSignedUrl(filePath, { bucket, expiresIn: 60 });
}

/**
 * Read a stored image URL back to raw bytes so the Circle serializer can push it
 * through `direct_uploads` at publish time. Throws on a non-ok response — the
 * serializer turns that into a fail-safe outcome ("post directly in Circle").
 */
export async function fetchImageBytes(src: string): Promise<SerializeImageBytes> {
	const url = await resolveFetchUrl(src);
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Image fetch failed (${res.status}) for ${src}`);
	}
	const data = new Uint8Array(await res.arrayBuffer());
	const contentType = res.headers.get("content-type") ?? "application/octet-stream";
	return { data, contentType, filename: filenameFromSrc(src) };
}

function filenameFromSrc(src: string): string {
	const last = src.split("?")[0]?.split("/").filter(Boolean).pop();
	if (!last) {
		return "image";
	}
	try {
		return decodeURIComponent(last);
	} catch {
		return last;
	}
}
