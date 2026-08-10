import { ORPCError } from "@orpc/client";
import { getHorseById } from "@repo/database";
import { getPublicUrl, getSignedUploadUrl } from "@repo/storage";
import { z } from "zod";

import { assertSafeFilename, audioFileSizeSchema } from "../../../../lib/upload-validation";
import { adminProcedure } from "../../../../orpc/procedures";

export const createAudioUploadUrl = adminProcedure
	.route({
		method: "POST",
		path: "/admin/horses/audio-upload-url",
		tags: ["Horses"],
		summary: "Create audio note upload URL",
		description: "Create a signed upload URL for a horse audio note",
	})
	.input(
		z.object({
			horseId: z.string(),
			filename: z.string(),
			fileSize: audioFileSizeSchema,
		}),
	)
	.handler(async ({ input, context }) => {
		assertSafeFilename(input.filename);

		const horse = await getHorseById(input.horseId);

		if (!horse || horse.organizationId !== context.session.activeOrganizationId) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}

		const path = `${horse.organizationId}/horses/${horse.id}/audio-notes/${input.filename}`;
		const signedUploadUrl = await getSignedUploadUrl(path, {
			bucket: "mediaPublic",
		});

		return { signedUploadUrl, path, publicUrl: getPublicUrl("mediaPublic", path) };
	});
