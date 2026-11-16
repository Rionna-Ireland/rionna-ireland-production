import { db } from "@repo/database";
import { z } from "zod";

import { memberProcedure } from "../../../orpc/procedures";

export const markSeen = memberProcedure
	.route({ method: "POST", path: "/inbox/seen", tags: ["Inbox"], summary: "Reset the unseen badge when the centre opens" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }) => {
		// updateMany: staff can pass memberProcedure without a Member row.
		await db.member.updateMany({
			where: { organizationId: input.organizationId, userId: user.id },
			data: { inboxUnseenCount: 0 },
		});
		return { ok: true as const };
	});
