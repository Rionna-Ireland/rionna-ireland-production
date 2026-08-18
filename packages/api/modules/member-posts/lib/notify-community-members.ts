import { logger } from "@repo/logs";

import { sendPush } from "../../push/service";

export interface NotifyCommunityMembersInput {
	organizationId: string;
	memberPostId: string;
	title: string;
	circlePostUrl?: string;
}

/**
 * Fires an org-wide NEWS_POST push when an admin publishes a community
 * announcement with "Notify members" checked. Reuses the newsPost preference
 * (no new enum / settings row). triggerRefId is the MemberPost id so PushLog
 * dedup does not collide with website NewsPost rows.
 *
 * Best-effort: publishMemberPost has already committed the published row —
 * a total push delivery failure (or a throw from sendPush itself) is
 * logged, never thrown, so the admin's publish action still succeeds.
 */
export async function notifyCommunityMembers(
	input: NotifyCommunityMembersInput,
): Promise<void> {
	try {
		const delivery = await sendPush({
			organizationId: input.organizationId,
			triggerType: "NEWS_POST",
			triggerRefId: input.memberPostId,
			title: input.title,
			body: "New announcement for all members.",
			data: input.circlePostUrl
				? { screen: "community", url: input.circlePostUrl }
				: { screen: "community" },
		});

		if (delivery.attempted > 0 && delivery.sent === 0) {
			logger.warn("[MemberPost] notifyMembers push delivery failed for the whole audience", {
				memberPostId: input.memberPostId,
				failed: delivery.failed,
			});
		} else {
			logger.info("[MemberPost] notifyMembers push summary", {
				memberPostId: input.memberPostId,
				attempted: delivery.attempted,
				sent: delivery.sent,
				failed: delivery.failed,
			});
		}
	} catch (error) {
		logger.error("[MemberPost] notifyMembers push delivery threw", {
			memberPostId: input.memberPostId,
			error,
		});
	}
}
