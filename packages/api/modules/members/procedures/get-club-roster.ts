import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { groupStatusesByUser, pickSubscriptionStatus } from "../lib/subscription-status";

/**
 * The unified member roster (S2-09 surface G) — one row per member combining
 * identity (Better-Auth), subscription status (Stripe), and community status
 * (Circle). This is the view no single dashboard provides; mostly read-only.
 */
export const getClubRoster = adminProcedure
	.route({
		method: "GET",
		path: "/admin/members/roster",
		tags: ["Members"],
		summary: "Unified member roster (identity + Stripe + Circle)",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input: { organizationId }, context }) => {
		// Tenant-isolation (S12-10): adminProcedure is a global role check, so an
		// admin may only read the roster of their own active org.
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		const members = await db.member.findMany({
			where: { organizationId },
			include: {
				user: { select: { id: true, name: true, email: true, role: true } },
			},
			orderBy: { createdAt: "asc" },
		});

		const purchases = await db.purchase.findMany({
			where: { organizationId, userId: { in: members.map((m) => m.userId) } },
			select: { userId: true, status: true },
		});

		const statusesByUser = groupStatusesByUser(purchases);

		return members.map((member) => {
			const userStatuses = statusesByUser.get(member.userId) ?? [];
			return {
				memberId: member.id,
				userId: member.userId,
				name: member.user.name,
				email: member.user.email,
				memberRole: member.role,
				subscriptionStatus: pickSubscriptionStatus(userStatuses),
				circleStatus: member.circleStatus,
				circleMemberId: member.circleMemberId,
				joinedAt: member.createdAt,
				foundingMember: member.foundingMember,
			};
		});
	});
