import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";
import { checkRateLimit } from "@repo/utils/lib/rate-limit";
import { z } from "zod";

import { assertSafeFilename } from "../../../lib/upload-validation";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	MEDIA_UPLOADS_PER_HOUR,
	POST_IMAGE_CONTENT_TYPES,
	POST_IMAGE_MAX_BYTES,
	POST_VIDEO_CONTENT_TYPES,
	POST_VIDEO_MAX_BYTES,
} from "../lib/limits";
import { signMediaToken } from "../lib/media-token";

const IMAGE_TYPES: readonly string[] = POST_IMAGE_CONTENT_TYPES;
const VIDEO_TYPES: readonly string[] = POST_VIDEO_CONTENT_TYPES;

/**
 * Register a member photo/video with Circle and hand the app a presigned S3 PUT
 * (S15-01): the bytes go phone → Circle, never through our server or storage.
 * The returned `mediaToken` proves to `createPost` that this member got this blob from us.
 */
export const createMediaUpload = protectedProcedure
	.route({
		method: "POST",
		path: "/community/media-upload",
		tags: ["Community"],
		summary: "Register a member post photo/video for direct upload to Circle",
	})
	.input(
		z.object({
			organizationId: z.string(),
			filename: z.string(),
			contentType: z.string(),
			byteSize: z.number().int().positive(),
			/** Base64 MD5 of the file, computed on the device. */
			checksum: z.string().min(1),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		const { organizationId, filename, byteSize, checksum } = input;
		const contentType = input.contentType.split(";")[0]?.trim().toLowerCase() ?? "";

		const org = await db.organization.findUnique({ where: { id: organizationId } });
		const metadata = parseOrgMetadata(org?.metadata ?? null);
		if (!org?.slug || metadata.features?.communityPosting === false) {
			throw new ORPCError("FORBIDDEN");
		}
		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId },
			select: { id: true, circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			throw new ORPCError("FORBIDDEN");
		}

		assertSafeFilename(filename);
		const kind = IMAGE_TYPES.includes(contentType) ? "image" : VIDEO_TYPES.includes(contentType) ? "video" : null;
		if (!kind) {
			throw new ORPCError("BAD_REQUEST", { message: "Unsupported file type" });
		}
		if (byteSize > (kind === "image" ? POST_IMAGE_MAX_BYTES : POST_VIDEO_MAX_BYTES)) {
			throw new ORPCError("BAD_REQUEST", { message: "File is too large" });
		}

		// Fails open when Upstash is unavailable (see checkRateLimit).
		const limit = await checkRateLimit({
			prefix: "rl:community:media",
			key: member.id,
			limit: MEDIA_UPLOADS_PER_HOUR,
			windowSeconds: 60 * 60,
		});
		if (!limit.ok) {
			throw new ORPCError("TOO_MANY_REQUESTS");
		}

		const result = await createCircleService(org.slug).createDirectUpload({
			filename,
			contentType,
			byteSize,
			checksum,
		});
		if (!result.ok) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not register the upload with Circle" });
		}
		const { signedId, attachableSgid, uploadUrl, uploadHeaders } = result.data;
		const cdnUrl = result.data.cdnUrl ?? "";

		const mediaToken = signMediaToken({
			signedId,
			attachableSgid,
			cdnUrl,
			contentType,
			kind,
			memberId: member.id,
			orgId: organizationId,
		});
		return { kind, uploadUrl, uploadHeaders, signedId, cdnUrl, mediaToken };
	});
