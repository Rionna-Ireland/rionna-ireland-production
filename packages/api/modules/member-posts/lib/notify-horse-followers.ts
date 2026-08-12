import { logger } from "@repo/logs";

import { sendPush } from "../../push/service";

export interface NotifyHorseFollowersInput {
	organizationId: string;
	horseId: string;
	memberPostId: string;
	title: string;
	horseName: string;
	updateType: string | null;
}

const UPDATE_TYPE_LABELS: Record<string, string> = {
	trainer: "Trainer",
	wellbeing: "Wellbeing",
	general: "General",
	race: "Race notes",
};

function pushBody(horseName: string, updateType: string | null): string {
	const label = updateType ? UPDATE_TYPE_LABELS[updateType] : undefined;
	return label
		? `${horseName} has a new ${label} update.`
		: `${horseName} has a new update.`;
}

/**
 * Fires a HORSE_UPDATE push scoped to a horse's followers when any
 * admin-authored horse update (trainer/wellbeing/general/race) is published
 * with "Notify followers" checked (S8-01a3 — one shared trigger + preference
 * covering all update types, replacing the wellbeing-only HORSE_WELLBEING
 * push).
 *
 * Best-effort: publishMemberPost has already committed the published row —
 * a total push delivery failure (or a throw from sendPush itself) is
 * logged, never thrown, so the admin's publish action still succeeds.
 */
export async function notifyHorseFollowers(input: NotifyHorseFollowersInput): Promise<void> {
	try {
		const delivery = await sendPush({
			organizationId: input.organizationId,
			triggerType: "HORSE_UPDATE",
			triggerRefId: input.memberPostId,
			title: input.title,
			body: pushBody(input.horseName, input.updateType),
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
