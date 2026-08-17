import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

// Admins occasionally attach a real video; keep a sane ceiling.
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Register a video blob with Circle and hand the client a presigned S3 URL so it
 * can PUT the bytes directly (browser → Circle S3 — verified CORS-open; the bytes
 * never pass through our server, dodging Vercel's request-body cap). The returned
 * `cdnUrl` + `signedId` + `attachableSgid` are stored on an editor `embed` node.
 * At publish the serializer emits a Circle `file` block (native uploads cannot
 * go through `/embeds` / iframely — that 4xxs on iPhone .mov and used to fail
 * the whole post). YouTube/Vimeo paste still uses `createEmbed`.
 */
export const createCircleVideoUpload = adminProcedure
	.route({
		method: "POST",
		path: "/admin/member-posts/circle-video-upload",
		tags: ["MemberPosts"],
		summary: "Register a Circle video direct-upload (client PUTs the bytes)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			filename: z.string().min(1),
			contentType: z
				.string()
				.transform((c) => c.split(";")[0]?.trim().toLowerCase() ?? "")
				.refine((c) => c.startsWith("video/"), "Must be a video file"),
			byteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
			/** Base64-encoded MD5 of the file bytes, computed in-browser. */
			checksum: z.string().min(1),
		}),
	)
	.handler(async ({ input }) => {
		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
			select: { slug: true },
		});
		if (!org?.slug) {
			throw new ORPCError("BAD_REQUEST", { message: "Organization not found" });
		}

		const circle = createCircleService(org.slug);
		const result = await circle.createDirectUpload({
			filename: input.filename,
			contentType: input.contentType,
			byteSize: input.byteSize,
			checksum: input.checksum,
		});
		if (!result.ok) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Could not register the video upload with Circle",
			});
		}

		return {
			uploadUrl: result.data.uploadUrl,
			uploadHeaders: result.data.uploadHeaders,
			cdnUrl: result.data.cdnUrl,
			signedId: result.data.signedId,
			attachableSgid: result.data.attachableSgid,
		};
	});
