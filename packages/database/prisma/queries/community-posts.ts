import { db } from "../client";

/**
 * Deleted posts still count toward the rate-limit window (no `deletedAt: null` filter) —
 * otherwise a member could delete-and-repost past the cap.
 */
export async function countRecentCommunityPosts(p: { organizationId: string; memberId: string; since: Date }) {
	return db.communityPost.count({
		where: { organizationId: p.organizationId, memberId: p.memberId, createdAt: { gte: p.since } },
	});
}

export async function createCommunityPost(p: {
	organizationId: string;
	memberId: string;
	circlePostId: string;
	circleSpaceId: string;
	title: string | null;
	excerpt: string;
	hasImage: boolean;
}) {
	return db.communityPost.create({
		data: {
			organizationId: p.organizationId,
			memberId: p.memberId,
			circlePostId: p.circlePostId,
			circleSpaceId: p.circleSpaceId,
			title: p.title,
			excerpt: p.excerpt,
			hasImage: p.hasImage,
		},
	});
}

export async function findOwnCommunityPost(p: { organizationId: string; memberId: string; circlePostId: string }) {
	return db.communityPost.findFirst({
		where: { organizationId: p.organizationId, memberId: p.memberId, circlePostId: p.circlePostId },
	});
}

export async function markCommunityPostDeleted(p: { circlePostId: string; deletedBy: "member" | "admin" }): Promise<void> {
	await db.communityPost.updateMany({
		where: { circlePostId: p.circlePostId },
		data: { deletedAt: new Date(), deletedBy: p.deletedBy },
	});
}
