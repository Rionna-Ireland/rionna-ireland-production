import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { clampBadge, readUnseenCount } from "../../inbox/procedures/get-badge-count";

export const getNotificationBadgeCount = protectedProcedure
	.route({
		method: "GET",
		path: "/circle/notification-badge-count",
		tags: ["Circle"],
		summary: "Legacy alias of inbox.badgeCount (S12-06) — remove once the 06b app build is the minimum",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }) => ({
		count: clampBadge(await readUnseenCount(user.id, input.organizationId)),
	}));
