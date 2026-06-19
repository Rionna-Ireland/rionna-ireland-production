import { getPublicUrl, getSignedUploadUrl } from "@repo/storage";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

export const createNewsImageUploadUrl = adminProcedure
	.route({
		method: "POST",
		path: "/admin/news/image-upload-url",
		tags: ["News"],
		summary: "Create a signed upload URL for a news image",
	})
	.input(
		z.object({
			organizationId: z.string(),
			filename: z.string(),
		}),
	)
	.handler(async ({ input: { organizationId, filename } }) => {
		const path = `${organizationId}/news/${filename}`;
		const signedUploadUrl = await getSignedUploadUrl(path, {
			bucket: "mediaPublic",
		});

		return { signedUploadUrl, path, publicUrl: getPublicUrl("mediaPublic", path) };
	});
