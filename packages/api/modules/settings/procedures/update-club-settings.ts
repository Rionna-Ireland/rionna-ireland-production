import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { parseOrgMetadata } from "@repo/database/types";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

const updateClubSettingsInput = z.object({
	organizationId: z.string(),
	brand: z
		.object({
			primaryColor: z.string().optional(),
			logoUrl: z.string().optional(),
			fontFamily: z.string().optional(),
		})
		.optional(),
	contact: z
		.object({
			aboutText: z.string().optional(),
			contactEmail: z.string().optional(),
			phone: z.string().optional(),
			address: z.string().optional(),
			socialLinks: z
				.object({
					website: z.string().optional(),
					instagram: z.string().optional(),
					twitter: z.string().optional(),
					facebook: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
	horseAutoFollow: z.boolean().optional(),
});

export const updateClubSettings = adminProcedure
	.route({
		method: "POST",
		path: "/admin/settings",
		tags: ["Admin"],
		summary: "Update club settings",
	})
	.input(updateClubSettingsInput)
	.handler(async ({ input: { organizationId, brand, contact, horseAutoFollow }, context }) => {
		const organization = await db.organization.findUnique({
			where: { id: organizationId },
			select: { metadata: true },
		});

		if (!organization) {
			throw new ORPCError("BAD_REQUEST", { message: "Organization not found" });
		}

		const existing = parseOrgMetadata(organization.metadata ?? null);

		const merged = {
			...existing,
			brand: brand
				? {
						...existing.brand,
						...brand,
					}
				: existing.brand,
			contact: contact
				? {
						...existing.contact,
						...contact,
						socialLinks: contact.socialLinks
							? {
									...existing.contact?.socialLinks,
									...contact.socialLinks,
								}
							: existing.contact?.socialLinks,
					}
				: existing.contact,
			horseAutoFollow: horseAutoFollow ?? existing.horseAutoFollow,
		};

		await db.organization.update({
			where: { id: organizationId },
			data: { metadata: JSON.stringify(merged) },
		});

		logger.info("Admin updated club settings", {
			event: "admin_club_settings_updated",
			actorUserId: context.user.id,
			organizationId,
		});

		return merged;
	});
