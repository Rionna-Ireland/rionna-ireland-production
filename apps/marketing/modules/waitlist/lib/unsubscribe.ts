import "server-only";
import { db } from "@repo/database";
import { logger } from "@repo/logs";

import { isPlausibleUnsubscribeToken } from "./schema";

export type UnsubscribeOutcome = "unsubscribed" | "noop";

/**
 * S12-09: flip the waitlist row owning `token` to `unsubscribed`.
 *
 * Idempotent: an unknown, malformed or already-unsubscribed token is a quiet
 * no-op, so callers can show the same generic message for every token (no
 * enumeration). Throws only on a database error.
 */
export async function unsubscribeWaitlistToken(token: unknown): Promise<UnsubscribeOutcome> {
	if (!isPlausibleUnsubscribeToken(token)) {
		logger.info("[Waitlist] unsubscribe with malformed token", {
			event: "waitlist_unsubscribe",
			matched: false,
		});
		return "noop";
	}

	const { count } = await db.waitlistSignup.updateMany({
		where: { unsubscribeToken: token, status: "subscribed" },
		data: { status: "unsubscribed", unsubscribedAt: new Date() },
	});

	logger.info("[Waitlist] unsubscribe", {
		event: "waitlist_unsubscribe",
		matched: count > 0,
	});

	return count > 0 ? "unsubscribed" : "noop";
}
