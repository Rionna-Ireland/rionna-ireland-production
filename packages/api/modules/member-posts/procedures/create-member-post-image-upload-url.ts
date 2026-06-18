import { getSignedUploadUrl } from "@repo/storage";
import { z } from "zod";

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
		}),
	)
	.handler(async ({ input: { organizationId, filename } }) => {
		const path = `${organizationId}/member-posts/${filename}`;
		const signedUploadUrl = await getSignedUploadUrl(path, {
			bucket: "media",
		});

		return { signedUploadUrl, path };
	});
