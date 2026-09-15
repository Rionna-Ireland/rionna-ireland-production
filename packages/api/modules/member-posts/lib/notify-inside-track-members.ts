import { logger } from "@repo/logs";

import { recordInbox } from "../../inbox/record";
import { sendPush } from "../../push/service";

export interface NotifyInsideTrackMembersInput {
	organizationId: string;
	memberPostId: string;
	title: string;
	/** S12-06: false = quiet publish — inbox item only, no push. */
	push?: boolean;
}

/**
 * Org-wide INSIDE_TRACK push when an admin publishes an Inside Track piece
 * with "Notify members" checked. triggerRefId is the MemberPost id (PushLog
 * dedup). Best-effort: the publish has already committed — log, never throw.
 *
 * S12-06: always records an org-wide inbox item first — even on a quiet
 * publish (`push: false`), the push is simply skipped.
 */
export async function notifyInsideTrackMembers(
	input: NotifyInsideTrackMembersInput,
): Promise<void> {
	const badgeByUserId = await recordInbox({
		organizationId: input.organizationId,
		audience: { kind: "org" },
		item: {
			kind: "inside_track",
			groupKey: `inside_track:${input.memberPostId}`,
			title: input.title,
			body: "New from the Inside Track.",
			data: { screen: "insideTrack" },
		},
	});

	if (input.push === false) return;

	try {
		const delivery = await sendPush({
			organizationId: input.organizationId,
			triggerType: "INSIDE_TRACK",
			triggerRefId: input.memberPostId,
			title: input.title,
			body: "New from the Inside Track.",
			data: { screen: "insideTrack" },
			badgeByUserId,
		});
		logger.info("[MemberPost] insideTrack notify summary", {
			memberPostId: input.memberPostId,
			attempted: delivery.attempted,
			sent: delivery.sent,
			failed: delivery.failed,
		});
	} catch (error) {
		logger.error("[MemberPost] insideTrack notify threw", {
			memberPostId: input.memberPostId,
			error,
		});
	}
}
