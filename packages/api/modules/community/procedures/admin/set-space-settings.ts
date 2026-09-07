import { ORPCError } from "@orpc/client";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { getHorseSpaceIds } from "../../lib/horse-space-ids";
import { isHorseSpace } from "../../lib/space-settings";
import { mergeSpaceSettings } from "../../lib/write-space-settings";

const setSpaceSettingsInput = z
	.object({
		organizationId: z.string(),
		spaceId: z.string().min(1),
		memberPosting: z.boolean().optional(),
		hideChip: z.boolean().optional(),
		autoJoin: z.boolean().optional(),
	})
	.refine(
		(v) => v.memberPosting !== undefined || v.hideChip !== undefined || v.autoJoin !== undefined,
		{
			message: "At least one of memberPosting, hideChip or autoJoin must be set",
		},
	);

export const setSpaceSettings = adminProcedure
	.route({
		method: "POST",
		path: "/admin/community/spaces/settings",
		tags: ["Community"],
		summary: "Set a Circle space's member-posting settings",
	})
	.input(setSpaceSettingsInput)
	.handler(async ({ input, context }) => {
		if (context.session.activeOrganizationId !== input.organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		// Final review I1: never let an admin flip `autoJoin` on for a private
		// or horse-backed space — the seed already refuses these by default,
		// but this is the other write path (the admin table) and has to enforce
		// the same rule server-side (the admin token can read both signals).
		if (input.autoJoin === true) {
			const org = await db.organization.findUnique({
				where: { id: input.organizationId },
				select: { slug: true, metadata: true },
			});
			// Residual fix (final re-review): don't fail open when we can't
			// verify the space with Circle — an org with no slug (can't build a
			// Circle service) or a failed listing means the private/horse guard
			// below can't be trusted, so refuse rather than silently allowing
			// auto-join on a space we never actually checked.
			if (!org?.slug) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Couldn't verify the space with Circle — try again.",
				});
			}

			const metadata = parseOrgMetadata(org.metadata as string | null);
			const circle = createCircleService(org.slug);
			const [spacesResult, horseSpaceIds] = await Promise.all([
				circle.listSpaces(),
				getHorseSpaceIds(input.organizationId),
			]);
			if (!spacesResult.ok) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Couldn't verify the space with Circle — try again.",
				});
			}

			const space = spacesResult.data.find((s) => s.id === input.spaceId);
			const isPrivate = space?.isPrivate === true;
			const isHorse =
				horseSpaceIds.has(input.spaceId) ||
				(space !== undefined && isHorseSpace(metadata, { spaceGroupId: space.spaceGroupId ?? null }));
			if (isPrivate || isHorse) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot enable auto-join for a private or horse space",
				});
			}
		}

		const settings = await mergeSpaceSettings({
			organizationId: input.organizationId,
			spaceId: input.spaceId,
			patch: {
				memberPosting: input.memberPosting,
				hideChip: input.hideChip,
				autoJoin: input.autoJoin,
			},
		});

		logger.info("Admin updated space posting settings", {
			event: "admin_space_settings_updated",
			actorUserId: context.user.id,
			organizationId: input.organizationId,
			spaceId: input.spaceId,
			settings,
		});

		return { ok: true as const, settings };
	});
