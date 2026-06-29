import { ORPCError } from "@orpc/server";
import { getOrganizationById } from "@repo/database";
import { getSignedUploadUrl } from "@repo/storage";
import z from "zod";

import { adminProcedure } from "../../../orpc/procedures";

export const createLogoUploadUrl = adminProcedure
	.route({
		method: "POST",
		path: "/organizations/logo-upload-url",
		tags: ["Organizations"],
		summary: "Create logo upload URL",
		description: "Create a signed upload URL to upload an logo image to the storage bucket",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ input: { organizationId } }) => {
		const organization = await getOrganizationById(organizationId);

		if (!organization) {
			throw new ORPCError("BAD_REQUEST");
		}

		const path = `${organizationId}.png`;
		const signedUploadUrl = await getSignedUploadUrl(path, {
			bucket: "avatars",
		});

		return { signedUploadUrl, path };
	});
