import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Register an event-cover image blob with Circle and hand the client a
 * presigned S3 URL so it can PUT the bytes directly (clone of
 * createCircleVideoUpload — see that procedure for the direct-upload
 * rationale). No `attachableSgid` needed: the cover is set via
 * `coverImageSignedId` on create/update, not an editor embed node.
 */
export const createEventCoverUpload = adminProcedure
	.route({
		method: "POST",
		path: "/admin/events/cover-upload",
		tags: ["Events"],
		summary: "Register a Circle event-cover direct upload",
	})
	.input(
		z.object({
			organizationId: z.string(),
			filename: z.string().min(1),
			contentType: z
				.string()
				.transform((c) => c.split(";")[0]?.trim().toLowerCase() ?? "")
				.refine((c) => c.startsWith("image/"), "Must be an image file"),
			byteSize: z.number().int().positive().max(MAX_COVER_BYTES),
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
				message: "Could not register the event cover upload with Circle",
			});
		}

		return {
			uploadUrl: result.data.uploadUrl,
			uploadHeaders: result.data.uploadHeaders,
			cdnUrl: result.data.cdnUrl,
			signedId: result.data.signedId,
		};
	});
