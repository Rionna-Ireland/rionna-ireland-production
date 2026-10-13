import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

/**
 * S13-19: set or clear a member's expert tag ("vet", "jockey"). A non-empty
 * label makes them an expert: shown as `{name}, {label}` and allowed to pin.
 */
export const setExpertLabel = adminProcedure
	.route({
		method: "POST",
		path: "/admin/members/expert-label",
		tags: ["Members"],
		summary: "Set or clear a member's expert tag",
	})
	.input(
		z.object({
			organizationId: z.string(),
			memberId: z.string(),
			/** Empty or null clears the tag. */
			expertLabel: z.string().trim().max(40).nullable(),
		}),
	)
	.handler(async ({ input: { organizationId, memberId, expertLabel }, context }) => {
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}
		const member = await db.member.findUnique({
			where: { id: memberId },
			select: { organizationId: true, userId: true },
		});
		if (!member || member.organizationId !== organizationId) {
			throw new ORPCError("NOT_FOUND");
		}
		const label = expertLabel && expertLabel.length > 0 ? expertLabel : null;
		await db.user.update({ where: { id: member.userId }, data: { expertLabel: label } });
		logger.info("Admin set expert label", {
			event: "admin_expert_label_set",
			actorUserId: context.user.id,
			organizationId,
			memberId,
			changedFields: ["expertLabel"],
			expertLabel: label,
		});
		return { memberId, expertLabel: label };
	});
