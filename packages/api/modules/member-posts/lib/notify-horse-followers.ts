import { logger } from "@repo/logs";

import { sendPush } from "../../push/service";

export interface NotifyHorseFollowersInput {
	organizationId: string;
	horseId: string;
	memberPostId: string;
	title: string;
	horseName: string;
}

/**
 * Fires a HORSE_WELLBEING push scoped to a horse's followers when a
 * wellbeing-type horse update is published with "Notify followers" checked
 * (S8-01a2 — the consolidated replacement for the deleted standalone
 * wellbeing timeline's publish-with-notify).
 *
 * Best-effort: publishMemberPost has already committed the published row —
 * a total push delivery failure (or a throw from sendPush itself) is
 * logged, never thrown, so the admin's publish action still succeeds.
 */
export async function notifyHorseFollowers(input: NotifyHorseFollowersInput): Promise<void> {
	try {
		const delivery = await sendPush({
			organizationId: input.organizationId,
			triggerType: "HORSE_WELLBEING",
			triggerRefId: input.memberPostId,
			title: input.title,
			body: `${input.horseName} has a new wellbeing update.`,
			data: { screen: "horse", horseId: input.horseId },
			followersOfHorseId: input.horseId,
		});

		if (delivery.attempted > 0 && delivery.sent === 0) {
			logger.warn("[MemberPost] notifyFollowers push delivery failed for the whole audience", {
				horseId: input.horseId,
				memberPostId: input.memberPostId,
				failed: delivery.failed,
			});
		} else {
			logger.info("[MemberPost] notifyFollowers push summary", {
				horseId: input.horseId,
				memberPostId: input.memberPostId,
				attempted: delivery.attempted,
				sent: delivery.sent,
				failed: delivery.failed,
			});
		}
	} catch (error) {
		logger.error("[MemberPost] notifyFollowers push delivery threw", {
			horseId: input.horseId,
			memberPostId: input.memberPostId,
			error,
		});
	}
}
