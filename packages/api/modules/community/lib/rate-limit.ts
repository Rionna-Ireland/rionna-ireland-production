/** Member post rate limiting (S12-02a): per-hour and per-day caps. */

import { checkRateLimit } from "@repo/utils/lib/rate-limit";

import { POSTS_PER_DAY, POSTS_PER_HOUR } from "./limits";

/**
 * Takes the member's slot in Redis before the Circle call, so parallel
 * requests cannot all pass a count of rows written afterwards (W-17).
 * Fails open when Upstash is unavailable (see checkRateLimit).
 */
export async function checkPostRateLimit(memberId: string): Promise<boolean> {
	const [hour, day] = await Promise.all([
		checkRateLimit({
			prefix: "rl:community:post:hour",
			key: memberId,
			limit: POSTS_PER_HOUR,
			windowSeconds: 60 * 60,
		}),
		checkRateLimit({
			prefix: "rl:community:post:day",
			key: memberId,
			limit: POSTS_PER_DAY,
			windowSeconds: 24 * 60 * 60,
		}),
	]);
	return hour.ok && day.ok;
}
