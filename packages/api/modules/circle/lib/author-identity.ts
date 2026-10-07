import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { STAFF_MEMBER_ROLES, STAFF_USER_ROLES } from "@repo/payments/lib/founding-member";

import { objectValue } from "./parse-post";

/** S13-11: club role badge shown next to an author. */
export type AuthorRole = "trainer" | "staff";

export interface PostAttributionView {
	name: string;
	avatarUrl: string | null;
}

const STAFF_MEMBER_ROLE_SET = new Set(STAFF_MEMBER_ROLES);
const STAFF_USER_ROLE_SET = new Set(STAFF_USER_ROLES);

/**
 * Map Circle community-member ids → club role, in two batched queries (never
 * per author). A linked trainer wins over staff; staff = org owner/admin or a
 * global admin/platformAdmin user. Any lookup failure degrades to
 * "no badges" — role is decoration and must never fail a feed or thread.
 */
export async function loadAuthorRoles(
	organizationId: string,
	circleMemberIds: Array<string | null | undefined>,
): Promise<Map<string, AuthorRole>> {
	const roles = new Map<string, AuthorRole>();
	const ids = [...new Set(circleMemberIds.filter((id): id is string => Boolean(id)))];
	if (ids.length === 0) return roles;
	try {
		const members = await db.member.findMany({
			where: { organizationId, circleMemberId: { in: ids } },
			select: { circleMemberId: true, userId: true, role: true, user: { select: { role: true } } },
		});
		if (members.length === 0) return roles;
		const trainers = await db.trainer.findMany({
			where: { organizationId, userId: { in: members.map((m) => m.userId) } },
			select: { userId: true },
		});
		const trainerUserIds = new Set(trainers.map((t) => t.userId));
		for (const member of members) {
			if (!member.circleMemberId) continue;
			if (trainerUserIds.has(member.userId)) {
				roles.set(member.circleMemberId, "trainer");
			} else if (
				STAFF_MEMBER_ROLE_SET.has(member.role) ||
				(member.user?.role != null && STAFF_USER_ROLE_SET.has(member.user.role))
			) {
				roles.set(member.circleMemberId, "staff");
			}
		}
	} catch (error) {
		logger.warn("[Circle] author role lookup failed; serving without badges", {
			organizationId,
			error: String(error),
		});
	}
	return roles;
}

/** Trainer avatar: explicit `meta.avatarUrl`, else the linked user's image. */
export function trainerAvatarUrl(trainer: {
	meta?: unknown;
	user?: { image?: string | null } | null;
}): string | null {
	const fromMeta = objectValue(trainer.meta)?.avatarUrl;
	if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta;
	return trainer.user?.image ?? null;
}

/** Batched `PostAttribution` lookup for a page of posts. Fails open to "none". */
export async function loadPostAttributions(
	organizationId: string,
	circlePostIds: string[],
): Promise<Map<string, PostAttributionView>> {
	const out = new Map<string, PostAttributionView>();
	const ids = [...new Set(circlePostIds.filter(Boolean))];
	if (ids.length === 0) return out;
	try {
		const rows = await db.postAttribution.findMany({
			where: { organizationId, circlePostId: { in: ids } },
			select: {
				circlePostId: true,
				trainer: {
					select: { name: true, meta: true, user: { select: { image: true } } },
				},
			},
		});
		for (const row of rows) {
			out.set(row.circlePostId, {
				name: row.trainer.name,
				avatarUrl: trainerAvatarUrl(row.trainer),
			});
		}
	} catch (error) {
		logger.warn("[Circle] post attribution lookup failed; serving real authors", {
			organizationId,
			error: String(error),
		});
	}
	return out;
}

interface PostLike {
	id: string;
	kind?: string;
	spaceId: string | null;
	authorName: string | null;
	authorAvatarUrl?: string | null;
	/**
	 * Circle community-member id of the REAL author. For trainer-attributed posts
	 * this stays the admin who actually posted (used server-side for `isOwn` and
	 * `authorRole`); `authorName`/`authorAvatarUrl` show the trainer. Clients must
	 * not display or key identity off this field.
	 */
	authorCircleMemberId?: string | null;
	isAnnouncement?: boolean;
	authorRole?: AuthorRole | null;
}

/**
 * Stamp announcement flag, author role and trainer attribution onto Circle post
 * items (feed items or a post detail). Poll/story rows are ours, not Circle's,
 * and pass through untouched.
 */
export async function enrichPosts<T extends PostLike>(
	organizationId: string,
	posts: T[],
	opts: { announcementSpaceId?: string | number | null },
): Promise<T[]> {
	const circlePosts = posts.filter((p) => p.kind !== "poll" && p.kind !== "story");
	if (circlePosts.length === 0) return posts;
	const [roles, attributions] = await Promise.all([
		loadAuthorRoles(
			organizationId,
			circlePosts.map((p) => p.authorCircleMemberId),
		),
		loadPostAttributions(
			organizationId,
			circlePosts.map((p) => p.id),
		),
	]);
	const announcementSpace =
		opts.announcementSpaceId === undefined || opts.announcementSpaceId === null
			? null
			: String(opts.announcementSpaceId);
	return posts.map((post) => {
		if (post.kind === "poll" || post.kind === "story") return post;
		const attribution = attributions.get(post.id);
		const base = {
			...post,
			isAnnouncement: announcementSpace !== null && post.spaceId === announcementSpace,
		};
		if (attribution) {
			return {
				...base,
				authorName: attribution.name,
				authorAvatarUrl: attribution.avatarUrl,
				authorRole: "trainer" as const,
			};
		}
		return {
			...base,
			authorRole: post.authorCircleMemberId
				? (roles.get(post.authorCircleMemberId) ?? null)
				: null,
		};
	});
}
