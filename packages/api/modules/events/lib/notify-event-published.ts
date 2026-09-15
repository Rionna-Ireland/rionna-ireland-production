import { logger } from "@repo/logs";

import { recordInbox } from "../../inbox/record";
import { sendPush } from "../../push/service";

export interface NotifyEventPublishedInput {
	organizationId: string;
	circleEventId: string;
	name: string;
	/** S12-06: false = quiet publish — inbox item only, no push. */
	push?: boolean;
}

/**
 * Org-wide EVENT_PUBLISHED push when an admin publishes an event through our
 * composer (spec decision 8 — Circle-side creation intentionally does not
 * push). triggerRefId is the Circle event id (PushLog dedup). Best-effort:
 * the event already exists in Circle — log, never throw.
 *
 * S12-06: always records an org-wide inbox item first — even on a quiet
 * publish (`push: false`), the push is simply skipped.
 */
export async function notifyEventPublished(input: NotifyEventPublishedInput): Promise<void> {
	const badgeByUserId = await recordInbox({
		organizationId: input.organizationId,
		audience: { kind: "org" },
		item: {
			kind: "event",
			groupKey: `event:${input.circleEventId}`,
			title: input.name,
			body: "New club event — tap for details and RSVP.",
			data: { screen: "event", eventId: input.circleEventId },
		},
	});

	if (input.push === false) return;

	try {
		const delivery = await sendPush({
			organizationId: input.organizationId,
			triggerType: "EVENT_PUBLISHED",
			triggerRefId: input.circleEventId,
			title: input.name,
			body: "New club event — tap for details and RSVP.",
			data: { screen: "event", eventId: input.circleEventId },
			badgeByUserId,
		});
		logger.info("[Events] publish notify summary", {
			circleEventId: input.circleEventId,
			attempted: delivery.attempted,
			sent: delivery.sent,
			failed: delivery.failed,
		});
	} catch (error) {
		logger.error("[Events] publish notify threw", {
			circleEventId: input.circleEventId,
			error,
		});
	}
}
