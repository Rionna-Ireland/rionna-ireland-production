import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

/**
 * S12-09 §6: waitlist counts for `/admin/waitlist` — subscribed/unsubscribed,
 * a breakdown by `?src=` source, and how many subscribers the launch email
 * would still reach (status subscribed, not yet sent).
 */
export const getWaitlistStats = adminProcedure
	.route({
		method: "GET",
		path: "/admin/waitlist/stats",
		tags: ["Waitlist"],
		summary: "Waitlist counts (status, source, launch send progress)",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input: { organizationId }, context }) => {
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		const [groups, launchPending] = await Promise.all([
			db.waitlistSignup.groupBy({
				by: ["status", "source"],
				where: { organizationId },
				_count: { _all: true },
			}),
			db.waitlistSignup.count({
				where: { organizationId, status: "subscribed", launchEmailSentAt: null },
			}),
		]);

		let subscribed = 0;
		let unsubscribed = 0;
		const bySource = new Map<string | null, { subscribed: number; unsubscribed: number }>();
		for (const group of groups) {
			const count = group._count._all;
			const entry = bySource.get(group.source) ?? { subscribed: 0, unsubscribed: 0 };
			if (group.status === "subscribed") {
				subscribed += count;
				entry.subscribed += count;
			} else {
				unsubscribed += count;
				entry.unsubscribed += count;
			}
			bySource.set(group.source, entry);
		}

		return {
			subscribed,
			unsubscribed,
			launchPending,
			launchSent: subscribed - launchPending,
			bySource: [...bySource.entries()]
				.map(([source, counts]) => ({ source, ...counts }))
				.sort((a, b) => b.subscribed - a.subscribed),
		};
	});
