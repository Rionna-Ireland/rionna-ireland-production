import { getSignedUploadUrl } from "@repo/storage";
import { z } from "zod";

import { assertSafeFilename, imageFileSizeSchema } from "../../../lib/upload-validation";
import { adminProcedure } from "../../../orpc/procedures";

export const createMemberPostImageUploadUrl = adminProcedure
	.route({
		method: "POST",
		path: "/admin/member-posts/image-upload-url",
		tags: ["MemberPosts"],
		summary: "Create a signed upload URL for a member-post image",
	})
	.input(
		z.object({
			organizationId: z.string(),
			filename: z.string(),
			fileSize: imageFileSizeSchema,
		}),
	)
	.handler(async ({ input: { organizationId, filename } }) => {
		assertSafeFilename(filename);

		const path = `${organizationId}/member-posts/${filename}`;
		const signedUploadUrl = await getSignedUploadUrl(path, {
			bucket: "media",
		});

		return { signedUploadUrl, path };
	});
