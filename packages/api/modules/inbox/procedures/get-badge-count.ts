import { db } from "@repo/database";
import { z } from "zod";

import { memberProcedure } from "../../../orpc/procedures";

/** The member's raw, uncapped unseen count (inbox.badgeCount). */
export async function readUnseenCount(userId: string, organizationId: string): Promise<number> {
	const member = await db.member.findUnique({
		where: { organizationId_userId: { organizationId, userId } },
		select: { inboxUnseenCount: true },
	});
	return Math.max(0, member?.inboxUnseenCount ?? 0);
}

export const getBadgeCount = memberProcedure
	.route({ method: "GET", path: "/inbox/badge-count", tags: ["Inbox"], summary: "Unseen notification count for the app badge" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }) => ({ count: await readUnseenCount(user.id, input.organizationId) }));
