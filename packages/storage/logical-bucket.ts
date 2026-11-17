import { config } from "./config";

// Private buckets the image proxy may sign reads for.
const ALLOWED_BUCKETS = ["avatars", "media"] as const;
export type LogicalBucket = (typeof ALLOWED_BUCKETS)[number];

/** Maps a path segment (logical key or resolved bucket name, e.g. "Staging_Bucket") to an allowed logical bucket. */
export const resolveLogicalBucket = (segment: string): LogicalBucket | undefined =>
	ALLOWED_BUCKETS.find((key) => key === segment || config.bucketNames[key] === segment);
