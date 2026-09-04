/** Member post rate limiting (S12-02a): per-hour and per-day caps. */

import { countRecentCommunityPosts } from "@repo/database";

import { POSTS_PER_DAY, POSTS_PER_HOUR } from "./limits";

export async function checkPostRateLimit(p: {
	organizationId: string;
	memberId: string;
	now: Date;
}): Promise<boolean> {
	const [hour, day] = await Promise.all([
		countRecentCommunityPosts({ ...p, since: new Date(p.now.getTime() - 60 * 60 * 1000) }),
		countRecentCommunityPosts({ ...p, since: new Date(p.now.getTime() - 24 * 60 * 60 * 1000) }),
	]);
	return hour < POSTS_PER_HOUR && day < POSTS_PER_DAY;
}
