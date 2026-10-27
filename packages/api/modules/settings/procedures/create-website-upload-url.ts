import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { getPublicUrl, getSignedUploadUrl } from "@repo/storage";
import { z } from "zod";

import { assertSafeFilename, MAX_IMAGE_UPLOAD_BYTES } from "../../../lib/upload-validation";
import { adminProcedure } from "../../../orpc/procedures";

const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const createWebsiteUploadUrl = adminProcedure
	.route({
		method: "POST",
		path: "/admin/settings/website-upload-url",
		tags: ["Admin"],
		summary: "Create website media upload URL",
	})
	.input(
		z.object({
			organizationId: z.string(),
			kind: z.enum(["hero", "about", "founder"]),
			filename: z.string(),
			fileSize: z.number().int().positive(),
			contentType: z.string(),
		}),
	)
	.handler(async ({ input: { organizationId, kind, filename, fileSize, contentType } }) => {
		assertSafeFilename(filename);

		const isVideo = contentType === "video/mp4";
		if (isVideo ? kind !== "hero" : !IMAGE_TYPES.includes(contentType)) {
			throw new ORPCError("BAD_REQUEST", { message: "Unsupported content type" });
		}
		if (fileSize > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_UPLOAD_BYTES)) {
			throw new ORPCError("BAD_REQUEST", { message: "File too large" });
		}

		const organization = await db.organization.findUnique({
			where: { id: organizationId },
			select: { id: true },
		});
		if (!organization) {
			throw new ORPCError("BAD_REQUEST", { message: "Organization not found" });
		}

		// uuid prefix: a re-upload never serves a stale CDN copy
		const path = `${organizationId}/website/${kind}/${randomUUID()}-${filename}`;
		const signedUploadUrl = await getSignedUploadUrl(path, { bucket: "mediaPublic" });

		return { signedUploadUrl, path, publicUrl: getPublicUrl("mediaPublic", path) };
	});
