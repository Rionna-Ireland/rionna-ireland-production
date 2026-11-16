import { db } from "@repo/database";
import { z } from "zod";

import { memberProcedure } from "../../../orpc/procedures";

export const markAllRead = memberProcedure
	.route({ method: "POST", path: "/inbox/read-all", tags: ["Inbox"], summary: "Mark every notification centre item read" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }) => {
		await db.inboxItem.updateMany({
			where: { userId: user.id, organizationId: input.organizationId, readAt: null },
			data: { readAt: new Date() },
		});
		return { ok: true as const };
	});
