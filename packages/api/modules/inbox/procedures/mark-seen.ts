import { db } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { isMember } from "../lib/membership";

export const markSeen = protectedProcedure
	.route({ method: "POST", path: "/inbox/seen", tags: ["Inbox"], summary: "Reset the unseen badge when the centre opens" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }) => {
		if (!(await isMember(user.id, input.organizationId))) return { ok: false as const };
		await db.member.update({
			where: { organizationId_userId: { organizationId: input.organizationId, userId: user.id } },
			data: { inboxUnseenCount: 0 },
		});
		return { ok: true as const };
	});
