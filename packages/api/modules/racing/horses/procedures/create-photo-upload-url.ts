import { ORPCError } from "@orpc/client";
import { getHorseById } from "@repo/database";
import { getPublicUrl, getSignedUploadUrl } from "@repo/storage";
import { z } from "zod";

import { assertSafeFilename, imageFileSizeSchema } from "../../../../lib/upload-validation";
import { adminProcedure } from "../../../../orpc/procedures";

export const createPhotoUploadUrl = adminProcedure
	.route({
		method: "POST",
		path: "/admin/horses/photo-upload-url",
		tags: ["Horses"],
		summary: "Create photo upload URL",
		description: "Create a signed upload URL for a horse photo",
	})
	.input(
		z.object({
			horseId: z.string(),
			filename: z.string(),
			fileSize: imageFileSizeSchema,
		}),
	)
	.handler(async ({ input }) => {
		assertSafeFilename(input.filename);

		const horse = await getHorseById(input.horseId);

		if (!horse) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}

		const path = `${horse.organizationId}/horses/${horse.id}/${input.filename}`;
		const signedUploadUrl = await getSignedUploadUrl(path, {
			bucket: "mediaPublic",
		});

		return { signedUploadUrl, path, publicUrl: getPublicUrl("mediaPublic", path) };
	});
