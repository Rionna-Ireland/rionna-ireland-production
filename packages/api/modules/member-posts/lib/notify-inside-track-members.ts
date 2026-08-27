import { logger } from "@repo/logs";

import { sendPush } from "../../push/service";

export interface NotifyInsideTrackMembersInput {
	organizationId: string;
	memberPostId: string;
	title: string;
}

/**
 * Org-wide INSIDE_TRACK push when an admin publishes an Inside Track piece
 * with "Notify members" checked. triggerRefId is the MemberPost id (PushLog
 * dedup). Best-effort: the publish has already committed — log, never throw.
 */
export async function notifyInsideTrackMembers(
	input: NotifyInsideTrackMembersInput,
): Promise<void> {
	try {
		const delivery = await sendPush({
			organizationId: input.organizationId,
			triggerType: "INSIDE_TRACK",
			triggerRefId: input.memberPostId,
			title: input.title,
			body: "New from the Inside Track.",
			data: { screen: "insideTrack" },
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
