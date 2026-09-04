import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { getSignedUploadUrl } from "@repo/storage";
import { z } from "zod";

import { assertSafeFilename, imageFileSizeSchema } from "../../../lib/upload-validation";
import { protectedProcedure } from "../../../orpc/procedures";
import { POST_IMAGE_CONTENT_TYPES } from "../lib/limits";
import type { CreatePostImageUploadUrlResult } from "../lib/types";

/**
 * Signed upload URL for a member's post image (S12-02a). Private `media`
 * bucket — the backend fetches the bytes server-side (`fetch-image-bytes`)
 * before forwarding them to Circle, so no public URL is ever handed out here.
 */
export const createPostImageUploadUrl = protectedProcedure
	.route({
		method: "POST",
		path: "/community/post-image-upload-url",
		tags: ["Community"],
		summary: "Signed upload URL for a member post image",
	})
	.input(
		z.object({
			organizationId: z.string(),
			filename: z.string(),
			fileSize: imageFileSizeSchema,
			contentType: z.enum(POST_IMAGE_CONTENT_TYPES),
		}),
	)
	.handler(
		async ({
			input: { organizationId, filename },
			context: { user },
		}): Promise<CreatePostImageUploadUrlResult> => {
			const org = await db.organization.findUnique({ where: { id: organizationId } });
			const metadata = parseOrgMetadata(org?.metadata ?? null);
			if (!org || metadata.features?.communityPosting === false) {
				throw new ORPCError("FORBIDDEN");
			}

			const member = await db.member.findFirst({
				where: { userId: user.id, organizationId },
				select: { id: true },
			});
			if (!member) {
				throw new ORPCError("FORBIDDEN");
			}

			assertSafeFilename(filename);

			const path = `community/${organizationId}/${member.id}/${randomUUID()}-${filename}`;
			const signedUploadUrl = await getSignedUploadUrl(path, { bucket: "media" });

			return { signedUploadUrl, path };
		},
	);
