import { db } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { isMember } from "../lib/membership";

export const markRead = protectedProcedure
	.route({ method: "POST", path: "/inbox/read", tags: ["Inbox"], summary: "Mark one notification centre item read" })
	.input(z.object({ organizationId: z.string(), id: z.string().min(1) }))
	.handler(async ({ input, context: { user } }) => {
		if (!(await isMember(user.id, input.organizationId))) return { ok: false as const };
		await db.inboxItem.updateMany({
			where: { id: input.id, userId: user.id, organizationId: input.organizationId, readAt: null },
			data: { readAt: new Date() },
		});
		return { ok: true as const };
	});
