/** Member post rate limiting (S12-02a): per-hour and per-day caps. */

import { checkRateLimit } from "@repo/utils/lib/rate-limit";

import { POSTS_PER_DAY, POSTS_PER_HOUR } from "./limits";

/**
 * Takes the member's slot in Redis before the Circle call, so parallel
 * requests cannot all pass a count of rows written afterwards (W-17).
 * Hour first, so an hour-blocked attempt does not spend the daily budget.
 * Fails open when Upstash is unavailable (see checkRateLimit).
 */
export async function checkPostRateLimit(memberId: string): Promise<boolean> {
	const hour = await checkRateLimit({
		prefix: "rl:community:post:hour",
		key: memberId,
		limit: POSTS_PER_HOUR,
		windowSeconds: 60 * 60,
	});
	if (!hour.ok) return false;
	const day = await checkRateLimit({
		prefix: "rl:community:post:day",
		key: memberId,
		limit: POSTS_PER_DAY,
		windowSeconds: 24 * 60 * 60,
	});
	return day.ok;
}
