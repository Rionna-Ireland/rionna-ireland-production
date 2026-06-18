import { ORPCError } from "@orpc/client";
import {
	createHorse as createHorseQuery,
	getHorseById,
	getHorseByOrgAndSlug,
} from "@repo/database";
import { provisionHorseSpace } from "@repo/payments/lib/circle-horse-provisioning";
import slugify from "@sindresorhus/slugify";
import { nanoid } from "nanoid";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const createHorse = adminProcedure
	.route({
		method: "POST",
		path: "/admin/horses",
		tags: ["Horses"],
		summary: "Create horse",
		description: "Create a new horse for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1),
			slug: z.string().optional(),
			status: z.enum(["PRE_TRAINING", "IN_TRAINING", "REHAB", "RETIRED", "SOLD"]).optional(),
			bio: z.string().optional(),
			trainerNotes: z.string().optional(),
			ownershipBlurb: z.string().optional(),
			pedigree: z
				.object({
					sire: z.string().optional(),
					dam: z.string().optional(),
					damsire: z.string().optional(),
				})
				.optional(),
			circleSpaceId: z.string().optional(),
			trainerId: z.string().optional(),
			sortOrder: z.number().optional(),
			publishedAt: z.date().nullable().optional(),
			publicProfileAt: z.date().nullable().optional(),
			providerEntityId: z.string().optional(),
		}),
	)
	.handler(async ({ input }) => {
		const baseSlug = input.slug
			? slugify(input.slug, { lowercase: true })
			: slugify(input.name, { lowercase: true });

		let slug = baseSlug;
		let hasAvailableSlug = false;

		for (let i = 0; i < 5; i++) {
			const existing = await getHorseByOrgAndSlug(input.organizationId, slug);

			if (!existing) {
				hasAvailableSlug = true;
				break;
			}

			slug = `${baseSlug}-${nanoid(5)}`;
		}

		if (!hasAvailableSlug) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Could not generate unique slug",
			});
		}

		const horse = await createHorseQuery({
			organizationId: input.organizationId,
			name: input.name,
			slug,
			status: input.status,
			bio: input.bio,
			trainerNotes: input.trainerNotes,
			ownershipBlurb: input.ownershipBlurb,
			pedigree: input.pedigree,
			circleSpaceId: input.circleSpaceId,
			circleSpaceStatus: input.circleSpaceId ? "active" : undefined,
			trainerId: input.trainerId,
			sortOrder: input.sortOrder,
			publishedAt: input.publishedAt,
			publicProfileAt: input.publicProfileAt,
			providerEntityId: input.providerEntityId,
		});

		// "A horse IS a Circle space" — auto-provision unless an existing space was
		// linked manually. Fail-safe: provisioning never throws; a failure lands as
		// circleSpaceStatus="provisioning_failed" for the reconciliation cron to retry.
		if (!input.circleSpaceId) {
			await provisionHorseSpace({
				id: horse.id,
				name: horse.name,
				organizationId: horse.organizationId,
			});
			return (await getHorseById(horse.id)) ?? horse;
		}

		return horse;
	});
