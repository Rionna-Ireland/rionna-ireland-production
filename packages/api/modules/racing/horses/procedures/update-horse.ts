import { ORPCError } from "@orpc/client";
import { db, getHorseById, updateHorse as updateHorseQuery } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
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
			circleSpaceId: z.string().nullable().optional(),
			trainerId: z.string().nullable().optional(),
			sortOrder: z.number().optional(),
			inviteOnly: z.boolean().optional(),
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

		const { horseId, photos, pedigree, ...rest } = input;

		const data: Record<string, unknown> = { ...rest };
		if (photos !== undefined) {
			data.photos = photos ?? [];
		}
		if (pedigree !== undefined) {
			data.pedigree = pedigree;
		}

		// S9-05: Circle space visibility is DERIVED from Horse.inviteOnly. Only
		// act when the value actually changes and a space already exists to
		// flip. Circle-first, DB-second per the pattern in
		// set-horse-space-visibility.ts (lines 21-25): on Circle failure we
		// still persist `inviteOnly` below (it's already in `data` via `rest`)
		// but leave `circleSpaceVisibility` unmirrored and warn — the standing
		// reconcile job heals the drift.
		const nextInviteOnly = input.inviteOnly;
		const inviteOnlyChanged =
			nextInviteOnly !== undefined && nextInviteOnly !== existing.inviteOnly;

		if (inviteOnlyChanged && existing.circleSpaceId && nextInviteOnly !== undefined) {
			const org = await db.organization.findUnique({
				where: { id: existing.organizationId },
				select: { slug: true },
			});

			if (org?.slug) {
				const circle = createCircleService(org.slug);
				const outcome = await circle.setSpaceVisibility({
					spaceId: existing.circleSpaceId,
					isPrivate: nextInviteOnly,
				});

				if (outcome.ok) {
					data.circleSpaceVisibility = nextInviteOnly ? "private" : "public";
				} else {
					logger.warn("[Circle] Horse space visibility flip failed; mirror left stale for reconcile to heal", {
						surface: "circle.horse_space_visibility",
						horseId,
						inviteOnly: nextInviteOnly,
						reason: outcome.reason,
						retriable: outcome.retriable,
					});
				}
			} else {
				logger.warn("[Circle] No organization slug; cannot flip horse space visibility", {
					surface: "circle.horse_space_visibility",
					horseId,
					organizationId: existing.organizationId,
				});
			}
		}

		return updateHorseQuery(horseId, data);
	});
