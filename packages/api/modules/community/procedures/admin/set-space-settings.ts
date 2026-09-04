import { ORPCError } from "@orpc/client";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { mergeSpaceSettings } from "../../lib/write-space-settings";

const setSpaceSettingsInput = z
	.object({
		organizationId: z.string(),
		spaceId: z.string().min(1),
		memberPosting: z.boolean().optional(),
		hideChip: z.boolean().optional(),
	})
	.refine((v) => v.memberPosting !== undefined || v.hideChip !== undefined, {
		message: "At least one of memberPosting or hideChip must be set",
	});

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

		const settings = await mergeSpaceSettings({
			organizationId: input.organizationId,
			spaceId: input.spaceId,
			patch: { memberPosting: input.memberPosting, hideChip: input.hideChip },
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
