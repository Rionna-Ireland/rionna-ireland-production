import { ORPCError } from "@orpc/client";
import { getHorseById, updateHorse as updateHorseQuery } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const updateHorse = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/horses/{horseId}",
		tags: ["Horses"],
		summary: "Update horse",
		description: "Update an existing horse",
	})
	.input(
		z.object({
			horseId: z.string(),
			name: z.string().min(1).optional(),
			slug: z.string().optional(),
			status: z.enum(["PRE_TRAINING", "IN_TRAINING", "REHAB", "RETIRED", "SOLD"]).optional(),
			bio: z.string().nullable().optional(),
			story: z.string().nullable().optional(),
			trainerNotes: z.string().nullable().optional(),
			ownershipBlurb: z.string().nullable().optional(),
			pedigree: z
				.object({
					sire: z.string().optional(),
					dam: z.string().optional(),
					damsire: z.string().optional(),
				})
				.nullable()
				.optional(),
			photos: z
				.array(
					z.object({
						url: z.string(),
						caption: z.string(),
					}),
				)
				.nullable()
				.optional(),
			audioNotes: z
				.array(
					z.object({
						url: z.string(),
						caption: z.string(),
					}),
				)
				.nullable()
				.optional(),
			circleSpaceId: z.string().nullable().optional(),
			trainerId: z.string().nullable().optional(),
			sortOrder: z.number().optional(),
			publishedAt: z.date().nullable().optional(),
			publicProfileAt: z.date().nullable().optional(),
			providerEntityId: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ input }) => {
		const existing = await getHorseById(input.horseId);

		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}

		const { horseId, photos, audioNotes, pedigree, ...rest } = input;

		const data: Record<string, unknown> = { ...rest };
		if (photos !== undefined) {
			data.photos = photos ?? [];
		}
		if (audioNotes !== undefined) {
			data.audioNotes = audioNotes ?? [];
		}
		if (pedigree !== undefined) {
			data.pedigree = pedigree;
		}

		return updateHorseQuery(horseId, data);
	});
