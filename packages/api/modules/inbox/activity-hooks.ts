import { db } from "@repo/database";
import { logger } from "@repo/logs";

import { excerptOf } from "../moderation/excerpt";
import { sendPush } from "../push/service";
import { COMMENT_PUSH_THROTTLE_MS, recordActivity } from "./activity";
import { dublinDateKey, firstPhotoUrl, presentInboxItem } from "./kinds";
import { recordInbox } from "./record";

type Actor = { userId: string; name: string | null };

/**
 * S12-06: member activity → inbox. Called fire-and-forget (`void`) from the
 * member write procedures after their Circle call succeeds. Every hook
 * swallows its own errors.
 */
async function guard(hook: string, context: Record<string, unknown>, run: () => Promise<void>): Promise<void> {
	try {
		await run();
	} catch (error) {
		logger.error("inbox.hook.failed", {
			hook,
			...context,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/** Author of a member-created post; null for club posts (no CommunityPost row) or a post from another org. */
async function findPostAuthor(organizationId: string, circlePostId: string, includeDeleted = false) {
	const post = await db.communityPost.findFirst({
		where: { circlePostId, organizationId },
		select: { memberId: true, circleSpaceId: true, excerpt: true, deletedAt: true },
	});
	if (!post || (post.deletedAt && !includeDeleted)) return null;
	const member = await db.member.findFirst({ where: { id: post.memberId, organizationId }, select: { userId: true } });
	return member ? { userId: member.userId, spaceId: post.circleSpaceId, excerpt: post.excerpt } : null;
}

export function onPostLiked(p: { organizationId: string; circlePostId: string; actor: Actor }): Promise<void> {
	return guard("onPostLiked", { circlePostId: p.circlePostId }, async () => {
		const author = await findPostAuthor(p.organizationId, p.circlePostId);
		if (!author) return;
		await recordActivity({
			organizationId: p.organizationId,
			recipientUserId: author.userId,
			actor: p.actor,
			item: {
				kind: "post_like",
				groupKey: `likes:${p.circlePostId}`,
				title: "",
				body: author.excerpt,
				data: { screen: "post", spaceId: author.spaceId, postId: p.circlePostId },
				refId: p.circlePostId,
			},
		});
	});
}

export function onPostCommented(p: {
	organizationId: string;
	circlePostId: string;
	commentBody: string;
	actor: Actor;
}): Promise<void> {
	return guard("onPostCommented", { circlePostId: p.circlePostId }, async () => {
		const author = await findPostAuthor(p.organizationId, p.circlePostId);
		if (!author) return;
		const data = { screen: "post" as const, spaceId: author.spaceId, postId: p.circlePostId };
		const body = excerptOf(p.commentBody, 140);
		const result = await recordActivity({
			organizationId: p.organizationId,
			recipientUserId: author.userId,
			actor: p.actor,
			item: { kind: "post_comment", groupKey: `comments:${p.circlePostId}`, title: "", body, data, refId: p.circlePostId },
			throttlePushMs: COMMENT_PUSH_THROTTLE_MS,
		});
		if (!result?.shouldPush || !result.pushedAt) return;
		await sendPush({
			organizationId: p.organizationId,
			triggerType: "COMMUNITY_COMMENT",
			triggerRefId: `${p.circlePostId}:${result.pushedAt.toISOString()}`,
			targetUserId: author.userId,
			title: presentInboxItem({ kind: "post_comment", title: "", body, actorName: p.actor.name, actorCount: 1 }).title,
			body,
			data,
			badge: result.unseenCount,
		});
	});
}

export function onMemberPostCreated(p: {
	organizationId: string;
	circleSpaceId: string;
	circlePostId: string;
	author: Actor;
}): Promise<void> {
	return guard("onMemberPostCreated", { circlePostId: p.circlePostId }, async () => {
		const horse = await db.horse.findFirst({
			where: { organizationId: p.organizationId, circleSpaceId: p.circleSpaceId },
			select: { id: true, name: true, photos: true },
		});
		if (!horse) return;
		await recordInbox({
			organizationId: p.organizationId,
			audience: { kind: "horseFollowers", horseId: horse.id },
			excludeUserId: p.author.userId,
			regroup: true,
			item: {
				kind: "horse_posts",
				groupKey: `horsePosts:${horse.id}:${dublinDateKey(new Date())}`,
				title: `New posts in ${horse.name}`,
				body: "",
				data: { screen: "spaceFeed", spaceId: p.circleSpaceId },
				refId: horse.id,
				imageUrl: firstPhotoUrl(horse.photos),
				actorUserId: p.author.userId,
				actorName: p.author.name,
			},
		});
	});
}

export function onCommunityPostRemoved(p: { organizationId: string; circlePostId: string }): Promise<void> {
	return guard("onCommunityPostRemoved", { circlePostId: p.circlePostId }, async () => {
		const author = await findPostAuthor(p.organizationId, p.circlePostId, true);
		if (!author) return;
		await recordActivity({
			organizationId: p.organizationId,
			recipientUserId: author.userId,
			actor: null,
			item: {
				kind: "post_removed",
				groupKey: `post_removed:${p.circlePostId}`,
				title: "Your post was removed",
				body: "It didn't meet the community guidelines.",
				data: { screen: "spaceFeed", spaceId: author.spaceId },
				refId: p.circlePostId,
			},
		});
	});
}
