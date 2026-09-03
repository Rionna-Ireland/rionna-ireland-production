import { getPublicUrl, getSignedUploadUrl } from "@repo/storage";
import { z } from "zod";

import { assertSafeFilename, imageFileSizeSchema } from "../../../../lib/upload-validation";
import { adminProcedure } from "../../../../orpc/procedures";

export const createOfferImageUploadUrl = adminProcedure
	.route({ method: "POST", path: "/admin/paddock/offers/image-upload-url", tags: ["Paddock"], summary: "Signed upload URL for an offer image" })
	.input(z.object({ organizationId: z.string(), filename: z.string(), fileSize: imageFileSizeSchema }))
	.handler(async ({ input: { organizationId, filename } }) => {
		assertSafeFilename(filename);
		const path = `${organizationId}/offers/${filename}`;
		const signedUploadUrl = await getSignedUploadUrl(path, { bucket: "mediaPublic" });
		return { signedUploadUrl, path, publicUrl: getPublicUrl("mediaPublic", path) };
	});
