import { db } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

/**
 * Club-health tiles for Mission Control (S2-09 surface A): paying members,
 * active subscriptions, past-due count, and Circle-provisioning failures
 * (members + horse spaces, combined into one "needs attention" number).
 */
export const getClubHealth = adminProcedure
	.route({
		method: "GET",
		path: "/admin/dashboard/health",
		tags: ["Dashboard"],
		summary: "Club-health counts for the admin dashboard",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input: { organizationId } }) => {
		const [
			memberCount,
			activeSubscriptionCount,
			pastDueCount,
			memberProvisioningFailures,
			horseProvisioningFailures,
		] = await Promise.all([
			db.member.count({ where: { organizationId, role: "member" } }),
			db.purchase.count({
				where: { organizationId, status: { in: ["active", "trialing"] } },
			}),
			db.purchase.count({ where: { organizationId, status: "past_due" } }),
			db.member.count({ where: { organizationId, circleStatus: "provisioning_failed" } }),
			db.horse.count({
				where: { organizationId, circleSpaceStatus: "provisioning_failed" },
			}),
		]);

		return {
			memberCount,
			activeSubscriptionCount,
			pastDueCount,
			circleProvisioningFailures: memberProvisioningFailures + horseProvisioningFailures,
		};
	});
