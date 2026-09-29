import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

/**
 * S12-09 §6: waitlist counts for `/admin/waitlist` — subscribed/unsubscribed
 * and a breakdown by `?src=` source.
 */
export const getWaitlistStats = adminProcedure
	.route({
		method: "GET",
		path: "/admin/waitlist/stats",
		tags: ["Waitlist"],
		summary: "Waitlist counts (status, source)",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input: { organizationId }, context }) => {
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		const groups = await db.waitlistSignup.groupBy({
			by: ["status", "source"],
			where: { organizationId },
			_count: { _all: true },
		});

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
			bySource: [...bySource.entries()]
				.map(([source, counts]) => ({ source, ...counts }))
				.sort((a, b) => b.subscribed - a.subscribed),
		};
	});
