import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

/**
 * S13-12: admin toggle for the founding-member flag. Either direction is
 * allowed; the 25-slot cap only governs automatic assignment.
 */
export const setFoundingMember = adminProcedure
	.route({
		method: "POST",
		path: "/admin/members/founding-member",
		tags: ["Members"],
		summary: "Set or clear a member's founding-member flag",
	})
	.input(
		z.object({
			organizationId: z.string(),
			memberId: z.string(),
			foundingMember: z.boolean(),
		}),
	)
	.handler(async ({ input: { organizationId, memberId, foundingMember }, context }) => {
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		const member = await db.member.findUnique({
			where: { id: memberId },
			select: { organizationId: true },
		});
		if (!member || member.organizationId !== organizationId) {
			throw new ORPCError("NOT_FOUND");
		}

		await db.member.update({ where: { id: memberId }, data: { foundingMember } });
		return { memberId, foundingMember };
	});
