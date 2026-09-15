import { db } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";

/** Shared by inbox.badgeCount and the legacy Circle badge route. Returns the raw, uncapped count. */
export async function readUnseenCount(userId: string, organizationId: string): Promise<number> {
	const member = await db.member.findUnique({
		where: { organizationId_userId: { organizationId, userId } },
		select: { inboxUnseenCount: true },
	});
	return Math.max(0, member?.inboxUnseenCount ?? 0);
}

/** Clamps a raw unseen count to the legacy Circle badge route's 0..99 display range. */
export function clampBadge(count: number): number {
	return Math.max(0, Math.min(99, count));
}

export const getBadgeCount = protectedProcedure
	.route({ method: "GET", path: "/inbox/badge-count", tags: ["Inbox"], summary: "Unseen notification count for the app badge" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }) => ({ count: await readUnseenCount(user.id, input.organizationId) }));
