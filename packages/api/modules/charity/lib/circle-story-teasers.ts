import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";

import { readMemberFeedBuffer } from "../../circle/lib/member-feed-cache";
import { type MemberFeedItem, extractPosts, objectValue, toFeedItem } from "../../circle/lib/parse-post";
import type { CharityStoryTeaser } from "./charity-view";

function toTeaser(item: MemberFeedItem, spaceId: string): CharityStoryTeaser {
	return {
		id: `circle:${item.id}`,
		source: "circle",
		slug: null,
		spaceId,
		postId: item.id,
		title: item.title ?? "",
		subtitle: item.excerpt,
		featuredImageUrl: item.imageUrl,
		publishedAt: item.createdAt ?? new Date(0).toISOString(),
	};
}

/**
 * S13-18: latest posts of the Charity Impact space as story teasers. Reuses the
 * member's merged-feed buffer when warm (zero Circle calls), else one
 * `/spaces/{id}/posts` read with the member token. Fails open to `[]`.
 */
export async function getCircleStoryTeasers(p: {
	organizationId: string;
	orgSlug: string;
	userId: string;
	circleMemberId: string | null;
	spaceId: string | undefined;
	communityDomain?: string;
	limit: number;
}): Promise<CharityStoryTeaser[]> {
	if (!p.spaceId || !p.circleMemberId || !p.orgSlug) return [];
	const spaceId = p.spaceId;
	try {
		const buffer = readMemberFeedBuffer(p.userId, p.organizationId);
		if (buffer) {
			return buffer
				.filter((i) => i.kind !== "poll" && i.kind !== "story" && i.spaceId === spaceId)
				.slice(0, p.limit)
				.map((i) => toTeaser(i, spaceId));
		}
		const token = await createCircleService(p.orgSlug).getMemberToken(p.circleMemberId);
		if (!token.ok) return [];
		const res = await fetch(
			`${getCircleHeadlessApiBaseUrl()}/spaces/${encodeURIComponent(spaceId)}/posts?per_page=${p.limit}&sort=latest`,
			{ headers: { Authorization: `Bearer ${token.data.accessToken}` } },
		);
		if (!res.ok) return [];
		return extractPosts(await res.json())
			.map((post) =>
				toFeedItem(
					{ ...post, space: objectValue(post.space) ?? { id: spaceId } },
					{ communityDomain: p.communityDomain },
				),
			)
			.filter((i) => i.id)
			.map((i) => toTeaser(i, spaceId));
	} catch (error) {
		logger.warn("[Charity] circle stories failed; serving news only", { error: String(error) });
		return [];
	}
}
