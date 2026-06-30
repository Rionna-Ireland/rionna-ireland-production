import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { getPublicUrl, getSignedUploadUrl } from "@repo/storage";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

export const createBrandUploadUrl = adminProcedure
	.route({
		method: "POST",
		path: "/admin/settings/brand-upload-url",
		tags: ["Admin"],
		summary: "Create brand logo upload URL",
	})
	.input(
		z.object({
			organizationId: z.string(),
			filename: z.string(),
		}),
	)
	.handler(async ({ input: { organizationId, filename } }) => {
		const organization = await db.organization.findUnique({
			where: { id: organizationId },
			select: { id: true },
		});

		if (!organization) {
			throw new ORPCError("BAD_REQUEST", { message: "Organization not found" });
		}

		const path = `${organizationId}/brand/${filename}`;
		const signedUploadUrl = await getSignedUploadUrl(path, {
			bucket: "mediaPublic",
		});

		return { signedUploadUrl, path, publicUrl: getPublicUrl("mediaPublic", path) };
	});
