import { getPublicUrl, getSignedUploadUrl } from "@repo/storage";
import { z } from "zod";

import { assertSafeFilename, imageFileSizeSchema } from "../../../../lib/upload-validation";
import { adminProcedure } from "../../../../orpc/procedures";

export const createCharityLogoUploadUrl = adminProcedure
	.route({ method: "POST", path: "/admin/charity/logo-upload-url", tags: ["Charity"], summary: "Signed upload URL for a charity logo" })
	.input(z.object({ organizationId: z.string(), filename: z.string(), fileSize: imageFileSizeSchema }))
	.handler(async ({ input: { organizationId, filename } }) => {
		assertSafeFilename(filename);
		const path = `${organizationId}/charity/${filename}`;
		const signedUploadUrl = await getSignedUploadUrl(path, { bucket: "mediaPublic" });
		return { signedUploadUrl, path, publicUrl: getPublicUrl("mediaPublic", path) };
	});
