import { auth } from "@repo/auth";
import { getSignedUrl } from "@repo/storage";
import { config as storageConfig } from "@repo/storage/config";

// Logical buckets this proxy is allowed to sign reads for. The first path
// segment may be either the logical key ("avatars" | "media") or the resolved
// bucket name (e.g. "Staging_Bucket"), so callers can pass either form.
const ALLOWED_BUCKETS = ["avatars", "media"] as const;
type LogicalBucket = (typeof ALLOWED_BUCKETS)[number];

const resolveLogicalBucket = (segment: string): LogicalBucket | undefined =>
	ALLOWED_BUCKETS.find((key) => key === segment || storageConfig.bucketNames[key] === segment);

export const GET = async (req: Request, { params }: { params: Promise<{ path: string[] }> }) => {
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

	// FABLE_AUDIT F1: both buckets are private and their keys are guessable
	// ({userId}.png avatars, {orgId}/member-posts/{file} media), so club-private
	// content must not be readable without a session. Every consumer of this
	// proxy lives inside the authenticated app; genuinely public assets use the
	// `media-public` bucket's direct URLs and never come through here (P5).
	const session = await auth.api.getSession({ headers: req.headers });
	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}

	const signedUrl = await getSignedUrl(filePath, {
		bucket,
		expiresIn: 60 * 60,
	});

	// Stream the bytes through (rather than 302-redirecting to the signed URL)
	// so the signed Supabase URL is never exposed to the client. Note: all
	// consumers are browser-initiated <img>/AvatarImage requests, which carry
	// the session cookie — do NOT put next/image in front of this route; its
	// optimizer fetches server-side without cookies and would 401 (F1).
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
