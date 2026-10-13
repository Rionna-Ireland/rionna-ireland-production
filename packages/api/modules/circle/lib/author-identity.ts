import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { STAFF_MEMBER_ROLES, STAFF_USER_ROLES } from "@repo/payments/lib/founding-member";

import { objectValue } from "./parse-post";

/** S13-11/S13-19: club role badge shown next to an author. */
export type AuthorRole = "trainer" | "expert" | "staff";

export interface AuthorIdentity {
	role: AuthorRole;
	/** Free-text expert tag ("vet"); only set for role "expert". */
	label: string | null;
}

export interface PostAttributionView {
	name: string;
	avatarUrl: string | null;
}

const STAFF_MEMBER_ROLE_SET = new Set(STAFF_MEMBER_ROLES);
const STAFF_USER_ROLE_SET = new Set(STAFF_USER_ROLES);

/** Role-only view of {@link loadAuthorIdentities}. */
export async function loadAuthorRoles(
	organizationId: string,
	circleMemberIds: Array<string | null | undefined>,
): Promise<Map<string, AuthorRole>> {
	const identities = await loadAuthorIdentities(organizationId, circleMemberIds);
	return new Map([...identities].map(([id, identity]) => [id, identity.role]));
}

/**
 * Map Circle community-member ids → club role (+ expert label), in two batched
 * queries (never per author). Precedence: linked trainer, then expert
 * (`User.expertLabel`), then staff (org owner/admin or a global
 * admin/platformAdmin user). Any lookup failure degrades to "no badges" —
 * role is decoration and must never fail a feed or thread.
 */
export async function loadAuthorIdentities(
	organizationId: string,
	circleMemberIds: Array<string | null | undefined>,
): Promise<Map<string, AuthorIdentity>> {
	const roles = new Map<string, AuthorIdentity>();
	const ids = [...new Set(circleMemberIds.filter((id): id is string => Boolean(id)))];
	if (ids.length === 0) return roles;
	try {
		const members = await db.member.findMany({
			where: { organizationId, circleMemberId: { in: ids } },
			select: { circleMemberId: true, userId: true, role: true, user: { select: { role: true, expertLabel: true } } },
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
				roles.set(member.circleMemberId, { role: "trainer", label: null });
			} else if (member.user?.expertLabel?.trim()) {
				roles.set(member.circleMemberId, { role: "expert", label: member.user.expertLabel.trim() });
			} else if (
				STAFF_MEMBER_ROLE_SET.has(member.role) ||
				(member.user?.role != null && STAFF_USER_ROLE_SET.has(member.user.role))
			) {
				roles.set(member.circleMemberId, { role: "staff", label: null });
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
	authorRoleLabel?: string | null;
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
		loadAuthorIdentities(
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
				authorRoleLabel: null,
			};
		}
		const identity = post.authorCircleMemberId ? roles.get(post.authorCircleMemberId) : undefined;
		return {
			...base,
			authorRole: identity?.role ?? null,
			authorRoleLabel: identity?.label ?? null,
		};
	});
}

/** Batched `CommentAttribution` lookup (S13-19). Fails open to "none". */
export async function loadCommentAttributions(
	organizationId: string,
	circleCommentIds: string[],
): Promise<Map<string, PostAttributionView>> {
	const out = new Map<string, PostAttributionView>();
	const ids = [...new Set(circleCommentIds.filter(Boolean))];
	if (ids.length === 0) return out;
	try {
		const rows = await db.commentAttribution.findMany({
			where: { organizationId, circleCommentId: { in: ids } },
			select: {
				circleCommentId: true,
				trainer: { select: { name: true, meta: true, user: { select: { image: true } } } },
			},
		});
		for (const row of rows) {
			out.set(row.circleCommentId, {
				name: row.trainer.name,
				avatarUrl: trainerAvatarUrl(row.trainer),
			});
		}
	} catch (error) {
		logger.warn("[Circle] comment attribution lookup failed; serving real authors", {
			organizationId,
			error: String(error),
		});
	}
	return out;
}

interface CommentLike {
	id: string;
	authorName: string | null;
	authorAvatarUrl: string | null;
	authorCircleMemberId: string | null;
	authorRole?: AuthorRole | null;
	authorRoleLabel?: string | null;
	replies: CommentLike[];
}

/**
 * S13-11/S13-19: stamp role, expert label and trainer attribution onto
 * comments (and their replies) in place, in two batched lookups. An
 * attributed comment shows the trainer's name/avatar and role "trainer".
 */
export async function enrichComments(
	organizationId: string,
	comments: CommentLike[],
): Promise<void> {
	const every = comments.flatMap((c) => [c, ...c.replies]);
	const [identities, attributions] = await Promise.all([
		loadAuthorIdentities(
			organizationId,
			every.map((c) => c.authorCircleMemberId),
		),
		loadCommentAttributions(
			organizationId,
			every.map((c) => c.id),
		),
	]);
	for (const comment of every) {
		const attribution = attributions.get(comment.id);
		if (attribution) {
			comment.authorName = attribution.name;
			comment.authorAvatarUrl = attribution.avatarUrl;
			comment.authorRole = "trainer";
			comment.authorRoleLabel = null;
			continue;
		}
		const identity = comment.authorCircleMemberId
			? identities.get(comment.authorCircleMemberId)
			: undefined;
		comment.authorRole = identity?.role ?? null;
		comment.authorRoleLabel = identity?.label ?? null;
	}
}
