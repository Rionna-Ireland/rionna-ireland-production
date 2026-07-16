import type { SerializeImageBytes } from "@repo/payments/lib/circle";
import { getSignedUrl } from "@repo/storage";
import { config as storageConfig } from "@repo/storage/config";
import { getBaseUrl } from "@repo/utils";

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
 * Origins this helper is allowed to fetch from (S5-09 Task 3.3, audit F4): the
 * Supabase host (public-bucket object URLs) and the app's own base URL (absolute
 * image-proxy links). Anything else is a server-side fetch of an
 * attacker-influenced URL — refuse it.
 */
function allowedImageOrigins(): Set<string> {
	const origins = new Set<string>();
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	if (supabaseUrl) {
		origins.add(new URL(supabaseUrl).origin);
	}
	origins.add(new URL(getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL)).origin);
	return origins;
}

function parseAbsoluteUrl(src: string): URL | null {
	try {
		return new URL(src);
	} catch {
		return null;
	}
}

/**
 * Resolve a stored image `src` to a directly fetchable URL. Images are stored as
 * relative `/image-proxy/{bucket}/{key}` URLs pointing at a PRIVATE bucket, so we
 * sign a short-lived GET server-side (a bare `fetch` of the relative path would
 * throw, and the bucket isn't publicly readable). Absolute URLs are restricted to
 * the app's own origins; app-origin proxy paths are signed like relative ones
 * (the proxy itself is auth-gated, so a raw server-side fetch would 401).
 */
async function resolveFetchUrl(src: string): Promise<string> {
	const absolute = parseAbsoluteUrl(src);
	if (absolute && !allowedImageOrigins().has(absolute.origin)) {
		throw new Error(`Refusing to fetch image from non-app origin: ${absolute.origin}`);
	}

	const match = (absolute ? absolute.pathname : src).match(PROXY_RE);
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
