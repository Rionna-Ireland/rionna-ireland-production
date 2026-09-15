import { db } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { isMember } from "../lib/membership";

export const markAllRead = protectedProcedure
	.route({ method: "POST", path: "/inbox/read-all", tags: ["Inbox"], summary: "Mark every notification centre item read" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }) => {
		if (!(await isMember(user.id, input.organizationId))) return { ok: false as const };
		await db.inboxItem.updateMany({
			where: { userId: user.id, organizationId: input.organizationId, readAt: null },
			data: { readAt: new Date() },
		});
		return { ok: true as const };
	});
