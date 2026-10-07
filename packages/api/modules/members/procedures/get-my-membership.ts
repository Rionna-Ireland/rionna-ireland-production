import { db } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { deriveMembershipStatus } from "../lib/membership-status";

/**
 * S13-12: the signed-in member's own membership summary for the mobile profile
 * and journey cards. D9: deliberately no renewal dates, amounts or payment
 * history. `since` is the only date.
 */
export const getMyMembership = protectedProcedure
	.route({
		method: "GET",
		path: "/me/membership",
		tags: ["Members"],
		summary: "Get the authenticated member's membership (since, founding flag, status)",
	})
	.output(
		z.object({
			since: z.string().nullable(),
			foundingMember: z.boolean(),
			status: z.enum(["active", "past_due", "cancelled", "none"]),
		}),
	)
	.handler(async ({ context: { user, session } }) => {
		const activeOrganizationId = session.activeOrganizationId ?? null;

		const member = await db.member.findFirst({
			where: {
				userId: user.id,
				...(activeOrganizationId ? { organizationId: activeOrganizationId } : {}),
			},
			select: { organizationId: true, createdAt: true, foundingMember: true },
			orderBy: { createdAt: "asc" },
		});

		if (!member) {
			return { since: null, foundingMember: false, status: "none" as const };
		}

		const purchases = await db.purchase.findMany({
			where: {
				userId: user.id,
				organizationId: member.organizationId,
				type: "SUBSCRIPTION",
			},
			select: { status: true },
		});

		return {
			since: member.createdAt.toISOString(),
			foundingMember: member.foundingMember,
			status: deriveMembershipStatus(purchases.map((p) => p.status)),
		};
	});
