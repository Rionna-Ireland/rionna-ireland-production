import { logger } from "@repo/logs";

import { recordInbox } from "../../inbox/record";
import { sendPush } from "../../push/service";

export interface NotifyCommunityMembersInput {
	organizationId: string;
	memberPostId: string;
	title: string;
	circlePostUrl?: string;
	circleSpaceId: string;
	circlePostId: string;
	/** S12-06: false = quiet publish — inbox item only, no push. */
	push?: boolean;
}

/**
 * Fires an org-wide NEWS_POST push when an admin publishes a community
 * announcement with "Notify members" checked. Reuses the newsPost preference
 * (no new enum / settings row). triggerRefId is the MemberPost id so PushLog
 * dedup does not collide with website NewsPost rows.
 *
 * S12-06: always records an org-wide inbox item first — even on a quiet
 * publish (`push: false`), the push is simply skipped.
 *
 * Best-effort: publishMemberPost has already committed the published row —
 * a total push delivery failure (or a throw from sendPush itself) is
 * logged, never thrown, so the admin's publish action still succeeds.
 */
export async function notifyCommunityMembers(
	input: NotifyCommunityMembersInput,
): Promise<void> {
	const badgeByUserId = await recordInbox({
		organizationId: input.organizationId,
		audience: { kind: "org" },
		item: {
			kind: "announcement",
			groupKey: `announcement:${input.memberPostId}`,
			title: input.title,
			body: "New announcement for all members.",
			data: { screen: "post", spaceId: input.circleSpaceId, postId: input.circlePostId },
		},
	});

	if (input.push === false) return;

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
			badgeByUserId,
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
