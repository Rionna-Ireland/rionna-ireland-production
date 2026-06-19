import { getSignedUrl } from "@repo/storage";
import { config as storageConfig } from "@repo/storage/config";

// Logical buckets this proxy is allowed to sign reads for. The first path
// segment may be either the logical key ("avatars" | "media") or the resolved
// bucket name (e.g. "Staging_Bucket"), so callers can pass either form.
const ALLOWED_BUCKETS = ["avatars", "media"] as const;
type LogicalBucket = (typeof ALLOWED_BUCKETS)[number];

const resolveLogicalBucket = (segment: string): LogicalBucket | undefined =>
	ALLOWED_BUCKETS.find((key) => key === segment || storageConfig.bucketNames[key] === segment);

export const GET = async (_req: Request, { params }: { params: Promise<{ path: string[] }> }) => {
	const { path } = await params;

	const [bucketSegment, ...rest] = path;
	const filePath = rest.join("/");

	if (!(bucketSegment && filePath)) {
		return new Response("Invalid path", { status: 400 });
	}

	const bucket = resolveLogicalBucket(bucketSegment);
	if (!bucket) {
		return new Response("Not found", { status: 404 });
	}

	const signedUrl = await getSignedUrl(filePath, {
		bucket,
		expiresIn: 60 * 60,
	});

	// Stream the bytes through (rather than 302-redirecting to the signed URL):
	// next/image's optimizer does not resolve a redirect to image bytes and fails
	// with "received null", whereas a plain <img> would. Proxying the body keeps
	// both consumers (next/image for media, <img> for avatars) working, and never
	// exposes the signed Supabase URL to the client.
	const upstream = await fetch(signedUrl);
	if (!upstream.ok || !upstream.body) {
		return new Response("Not found", { status: 404 });
	}

	return new Response(upstream.body, {
		status: 200,
		headers: {
			"Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
			"Cache-Control": "private, max-age=3600",
		},
	});
};
