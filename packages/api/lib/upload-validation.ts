import { ORPCError } from "@orpc/server";
import { z } from "zod";

/**
 * Upload hardening (S5-09 Task 3.3, audit F3).
 *
 * Plain S3 presigned PUTs can't carry a Content-Length condition, so the image
 * size cap validates the client-declared `fileSize` app-side (honest-client
 * enforcement) and relies on bucket-level limits for the rest — the residual gap
 * is documented in FABLE_AUDIT. Circle video uploads keep their own 500 MB cap in
 * `create-circle-video-upload.ts` (those bytes never touch our storage).
 */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Client-declared byte size for a presigned image PUT, capped at 10 MB. */
export const imageFileSizeSchema = z
	.number()
	.int()
	.positive()
	.max(MAX_IMAGE_UPLOAD_BYTES);

/**
 * Audio notes (S8-01 §5/§6) — short admin-uploaded clips, not multi-hour
 * recordings, so a smaller cap than video (which never touches our storage —
 * see the Circle video upload comment above) but roomier than a photo.
 */
export const MAX_AUDIO_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Client-declared byte size for a presigned audio PUT, capped at 25 MB. */
export const audioFileSizeSchema = z
	.number()
	.int()
	.positive()
	.max(MAX_AUDIO_UPLOAD_BYTES);

/**
 * Filenames are concatenated into storage keys — restrict to a single safe path
 * segment (no separators, no leading dot/dash, max 121 chars).
 */
export const SAFE_FILENAME = /^[\w][\w.-]{0,120}$/;

export function assertSafeFilename(filename: string): void {
	if (!SAFE_FILENAME.test(filename)) {
		throw new ORPCError("BAD_REQUEST", { message: "Invalid filename" });
	}
}
