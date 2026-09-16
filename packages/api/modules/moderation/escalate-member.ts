import { countMemberBlocksSince, createModerationFlag, findLastDismissedAttention } from "@repo/database";
import { logger } from "@repo/logs";

import { notifyClubAdmins } from "./notify-club-admins";

export const ESCALATION_THRESHOLD = 3;
export const ESCALATION_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Start of the rolling escalation window: `lastDismissedAt` when it falls
 * inside the last `ESCALATION_WINDOW_DAYS` (a dismissal resets the window),
 * otherwise `anchor` minus `ESCALATION_WINDOW_DAYS`. Shared by
 * `maybeEscalateMember` (block counting) and the admin attention list
 * (displayed blocks) so both sides agree on the same window.
 */
export function escalationWindowStart(anchor: Date, lastDismissedAt: Date | null): Date {
	const windowStart = new Date(anchor.getTime() - ESCALATION_WINDOW_DAYS * DAY_MS);
	return lastDismissedAt && lastDismissedAt > windowStart ? lastDismissedAt : windowStart;
}

/**
 * S12-08 decision 12: ≥ 3 blocks (word gate + auto) in a rolling 30 days →
 * one open `attention` flag + one admin email. A dismissal resets the window.
 * Idempotent through the partial unique index on open attention flags:
 * `createModerationFlag` returns null when one is already open → no email.
 * Never throws.
 */
export async function maybeEscalateMember(p: { organizationId: string; memberId: string; now?: Date }): Promise<void> {
	const { organizationId, memberId } = p;
	try {
		const now = p.now ?? new Date();
		const lastDismissed = await findLastDismissedAttention({ organizationId, memberId });
		const since = escalationWindowStart(now, lastDismissed?.resolvedAt ?? null);

		const count = await countMemberBlocksSince({ organizationId, memberId, since });
		if (count < ESCALATION_THRESHOLD) return;

		const created = await createModerationFlag({
			organizationId,
			source: "attention",
			surface: "member",
			memberId,
			contentExcerpt: `${count} blocked posts or comments in the last ${ESCALATION_WINDOW_DAYS} days`,
			matchedTerms: [],
		});
		if (!created) return;

		logger.info("moderation.member_escalated", { organizationId, memberId, count });
		await notifyClubAdmins({
			organizationId,
			title: "Member needs attention",
			message: `A member has had ${count} posts or comments blocked by moderation in the last ${ESCALATION_WINDOW_DAYS} days.`,
			path: "/admin/moderation",
		});
	} catch (error) {
		logger.warn("moderation.escalation_failed", { organizationId, memberId, error: String(error) });
	}
}
