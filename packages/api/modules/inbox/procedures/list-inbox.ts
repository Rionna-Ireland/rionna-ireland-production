import { db } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { type InboxDeepLink, type InboxIcon, type InboxKind, isInboxKind, KIND_META, presentInboxItem } from "../kinds";
import { decodeCursor, encodeCursor } from "../lib/cursor";

export const INBOX_PAGE_SIZE = 30;

export interface InboxListItem {
	id: string;
	kind: InboxKind;
	icon: InboxIcon;
	title: string;
	body: string;
	imageUrl: string | null;
	actorAvatarUrl: string | null;
	data: InboxDeepLink;
	unread: boolean;
	updatedAt: string;
}

export interface InboxListResult {
	items: InboxListItem[];
	nextCursor: string | null;
}

const EMPTY_RESULT: InboxListResult = { items: [], nextCursor: null };

/**
 * S12-06 notification centre feed: keyset-paginated, isolated to the caller's
 * (userId, organizationId). Grouped kinds (likes/comments/horse posts) are
 * rendered at read time via `presentInboxItem` so one bulk regroup update on
 * write fits every row.
 */
export const listInbox = protectedProcedure
	.route({ method: "GET", path: "/inbox", tags: ["Inbox"], summary: "List the member's notification centre items" })
	.input(z.object({ organizationId: z.string(), cursor: z.string().optional() }))
	.handler(async ({ input, context: { user } }): Promise<InboxListResult> => {
		const member = await db.member.findUnique({
			where: { organizationId_userId: { organizationId: input.organizationId, userId: user.id } },
			select: { id: true },
		});
		if (!member) return EMPTY_RESULT;

		// A cursor that fails to decode is malformed input, not "no cursor" —
		// return empty rather than silently restarting at page 1.
		const cursor = input.cursor ? decodeCursor(input.cursor) : null;
		if (input.cursor && !cursor) return EMPTY_RESULT;

		const rows = await db.inboxItem.findMany({
			where: {
				userId: user.id,
				organizationId: input.organizationId,
				...(cursor
					? { OR: [{ updatedAt: { lt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }] }
					: {}),
			},
			orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
			take: INBOX_PAGE_SIZE + 1,
			select: {
				id: true,
				kind: true,
				title: true,
				body: true,
				imageUrl: true,
				actorUserId: true,
				actorName: true,
				actorCount: true,
				data: true,
				readAt: true,
				updatedAt: true,
			},
		});

		const page = rows.slice(0, INBOX_PAGE_SIZE);
		const last = page[page.length - 1];
		const nextCursor = rows.length > INBOX_PAGE_SIZE && last ? encodeCursor(last) : null;

		const actorIds = [...new Set(page.map((r) => r.actorUserId).filter((id): id is string => Boolean(id)))];
		const actors = actorIds.length
			? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, image: true } })
			: [];
		const avatarById = new Map(actors.map((a) => [a.id, a.image]));

		const items: InboxListItem[] = [];
		for (const row of page) {
			if (!isInboxKind(row.kind)) continue;
			const { title, body } = presentInboxItem(row);
			items.push({
				id: row.id,
				kind: row.kind,
				icon: KIND_META[row.kind].icon,
				title,
				body,
				imageUrl: row.imageUrl,
				actorAvatarUrl: row.actorUserId ? (avatarById.get(row.actorUserId) ?? null) : null,
				data: row.data as InboxDeepLink,
				unread: row.readAt === null,
				updatedAt: row.updatedAt.toISOString(),
			});
		}

		return { items, nextCursor };
	});
