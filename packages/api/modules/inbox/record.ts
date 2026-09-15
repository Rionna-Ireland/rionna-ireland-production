import { db } from "@repo/database";
import { logger } from "@repo/logs";

import { type InboxAudience, resolveInboxUserIds } from "./audience";
import { type InboxDeepLink, type InboxKind, KIND_META } from "./kinds";

export type { InboxAudience } from "./audience";

export type BadgeMap = Map<string, number>;

export const INBOX_BATCH_SIZE = 500;

export interface InboxItemInput {
	kind: InboxKind;
	groupKey: string;
	title: string;
	body: string;
	data: InboxDeepLink;
	refId?: string | null;
	imageUrl?: string | null;
	actorUserId?: string | null;
	actorName?: string | null;
}

/**
 * S12-06 fan-out: one inbox row per recipient, idempotent on
 * (userId, groupKey). Returns each recipient's unseen count so the caller's
 * push can carry it as the app-icon badge. Never throws — an inbox failure
 * must not fail a publish, an ingest tick or a push.
 *
 * `regroup`: existing rows for the same groupKey are re-surfaced (unread,
 * newest actor, actorCount+1) instead of being left alone.
 */
export async function recordInbox(p: {
	organizationId: string;
	audience: InboxAudience;
	excludeUserId?: string | null;
	item: InboxItemInput;
	regroup?: boolean;
}): Promise<BadgeMap> {
	const badges: BadgeMap = new Map();
	const { organizationId, item } = p;

	try {
		const userIds = await resolveInboxUserIds(organizationId, p.audience, p.excludeUserId);

		for (let i = 0; i < userIds.length; i += INBOX_BATCH_SIZE) {
			const batch = userIds.slice(i, i + INBOX_BATCH_SIZE);

			const created = await db.inboxItem.createManyAndReturn({
				data: batch.map((userId) => ({
					organizationId,
					userId,
					kind: item.kind,
					groupKey: item.groupKey,
					title: item.title,
					body: item.body,
					data: item.data,
					refId: item.refId ?? null,
					imageUrl: item.imageUrl ?? null,
					actorUserId: item.actorUserId ?? null,
					actorName: item.actorName ?? null,
				})),
				skipDuplicates: true,
				select: { userId: true },
			});
			const createdIds = new Set(created.map((row) => row.userId));
			const bumpIds = [...createdIds];

			if (p.regroup) {
				const existing = batch.filter((id) => !createdIds.has(id));
				if (existing.length > 0) {
					await db.inboxItem.updateMany({
						where: { userId: { in: existing }, groupKey: item.groupKey },
						data: {
							readAt: null,
							actorUserId: item.actorUserId ?? null,
							actorName: item.actorName ?? null,
							actorCount: { increment: 1 },
							updatedAt: new Date(),
						},
					});
					if (KIND_META[item.kind].bumpOnRegroup) bumpIds.push(...existing);
				}
			}

			if (bumpIds.length > 0) {
				await db.member.updateMany({
					where: { organizationId, userId: { in: bumpIds } },
					data: { inboxUnseenCount: { increment: 1 } },
				});
			}

			const counts = await db.member.findMany({
				where: { organizationId, userId: { in: batch } },
				select: { userId: true, inboxUnseenCount: true },
			});
			for (const row of counts) badges.set(row.userId, row.inboxUnseenCount);
		}
	} catch (error) {
		logger.error("inbox.record.failed", {
			organizationId,
			kind: item.kind,
			groupKey: item.groupKey,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return badges;
}
