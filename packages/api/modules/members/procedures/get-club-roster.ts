import { db } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

// Priority order — the "best" current standing wins when a member has several
// purchase rows (e.g. an old canceled sub + a current past_due one).
const STATUS_PRIORITY = ["active", "trialing", "past_due", "canceled", "expired"] as const;

function pickSubscriptionStatus(statuses: string[]): string {
	for (const status of STATUS_PRIORITY) {
		if (statuses.includes(status)) return status;
	}
	return statuses[0] ?? "none";
}

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
	.handler(async ({ input: { organizationId } }) => {
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

		const statusesByUser = new Map<string, string[]>();
		for (const purchase of purchases) {
			if (!purchase.userId || !purchase.status) continue;
			const list = statusesByUser.get(purchase.userId) ?? [];
			list.push(purchase.status);
			statusesByUser.set(purchase.userId, list);
		}

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
			};
		});
	});
