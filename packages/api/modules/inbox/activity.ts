import { db } from "@repo/database";
import { logger } from "@repo/logs";

import { KIND_META } from "./kinds";
import type { InboxItemInput } from "./record";

export const COMMENT_PUSH_THROTTLE_MS = 15 * 60 * 1000;

function isUniqueConstraintError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/**
 * S12-06: one grouped inbox row for one recipient (likes/comments on their
 * post, their post removed). Optionally claims a push window atomically so
 * concurrent comments can't both push (spec decision 13). Never throws.
 */
export async function recordActivity(p: {
	organizationId: string;
	recipientUserId: string;
	actor: { userId: string; name: string | null };
	item: Omit<InboxItemInput, "actorUserId" | "actorName">;
	throttlePushMs?: number;
	now?: Date;
}): Promise<{ unseenCount: number; shouldPush: boolean; pushedAt: Date | null } | null> {
	const { organizationId, recipientUserId: userId, actor, item } = p;
	if (userId === actor.userId) return null;
	const now = p.now ?? new Date();

	try {
		let regrouped = false;
		try {
			await db.inboxItem.create({
				data: {
					organizationId,
					userId,
					kind: item.kind,
					groupKey: item.groupKey,
					title: item.title,
					body: item.body,
					data: item.data,
					refId: item.refId ?? null,
					imageUrl: item.imageUrl ?? null,
					actorUserId: actor.userId,
					actorName: actor.name,
				},
			});
		} catch (error) {
			if (!isUniqueConstraintError(error)) throw error;
			regrouped = true;
			await db.inboxItem.update({
				where: { userId_groupKey: { userId, groupKey: item.groupKey } },
				data: {
					readAt: null,
					body: item.body,
					data: item.data,
					actorUserId: actor.userId,
					actorName: actor.name,
					actorCount: { increment: 1 },
				},
			});
		}

		const memberWhere = { organizationId_userId: { organizationId, userId } };
		const shouldBump = !regrouped || KIND_META[item.kind].bumpOnRegroup;
		const member = shouldBump
			? await db.member.update({
					where: memberWhere,
					data: { inboxUnseenCount: { increment: 1 } },
					select: { inboxUnseenCount: true },
				})
			: await db.member.findUnique({ where: memberWhere, select: { inboxUnseenCount: true } });

		let shouldPush = false;
		if (p.throttlePushMs) {
			const claim = await db.inboxItem.updateMany({
				where: {
					userId,
					groupKey: item.groupKey,
					OR: [{ lastPushedAt: null }, { lastPushedAt: { lt: new Date(now.getTime() - p.throttlePushMs) } }],
				},
				data: { lastPushedAt: now },
			});
			shouldPush = claim.count === 1;
		}

		return { unseenCount: member?.inboxUnseenCount ?? 0, shouldPush, pushedAt: shouldPush ? now : null };
	} catch (error) {
		logger.error("inbox.activity.failed", {
			organizationId,
			kind: item.kind,
			groupKey: item.groupKey,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}
