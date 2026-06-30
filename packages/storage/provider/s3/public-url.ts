import { config } from "../../config";
import type { StorageBucketNamesConfig } from "../../types";

/**
 * Build the public, CDN-served Supabase object URL for a key in a PUBLIC bucket.
 *
 * Note the host: public objects are served from the single-label
 * `<ref>.supabase.co` host, NOT the two-label S3 host `<ref>.storage.supabase.co`
 * used for signed uploads. `NEXT_PUBLIC_SUPABASE_URL` must be the single-label form
 * (e.g. `https://<ref>.supabase.co`).
 *
 * Pure string build — no AWS SDK import — so it's safe to call from any context.
 * Only use this for buckets that are actually public (e.g. `mediaPublic`); private
 * buckets must continue to be served via the signed-URL image proxy.
 */
export function getPublicUrl(bucket: keyof StorageBucketNamesConfig, key: string): string {
	const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	if (!baseUrl) {
		throw new Error("Missing env variable NEXT_PUBLIC_SUPABASE_URL");
	}

	const bucketName = config.bucketNames[bucket];
	if (!bucketName) {
		throw new Error("Invalid bucket");
	}

	return `${baseUrl}/storage/v1/object/public/${bucketName}/${key}`;
}
