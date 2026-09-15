import { db } from "@repo/database";
import { logger } from "@repo/logs";

import { firstPhotoUrl } from "../../inbox/kinds";
import { recordInbox } from "../../inbox/record";
import { sendPush } from "../../push/service";

export interface NotifyHorseFollowersInput {
	organizationId: string;
	horseId: string;
	memberPostId: string;
	title: string;
	horseName: string;
	updateType: string | null;
	/** S12-06: false = quiet publish — inbox item only, no push. */
	push?: boolean;
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
 * S12-06: always records an inbox item for the horse's followers first —
 * even on a quiet publish (`push: false`), the push is simply skipped.
 *
 * Best-effort: publishMemberPost has already committed the published row —
 * a total push delivery failure (or a throw from sendPush itself) is
 * logged, never thrown, so the admin's publish action still succeeds.
 */
export async function notifyHorseFollowers(input: NotifyHorseFollowersInput): Promise<void> {
	const horse = await db.horse.findUnique({ where: { id: input.horseId }, select: { photos: true } }).catch((error) => {
		logger.warn("inbox.horse_photo_lookup_failed", { horseId: input.horseId, error });
		return null;
	});

	const badgeByUserId = await recordInbox({
		organizationId: input.organizationId,
		audience: { kind: "horseFollowers", horseId: input.horseId },
		item: {
			kind: "horse_update",
			groupKey: `horse_update:${input.memberPostId}`,
			title: input.title,
			body: pushBody(input.horseName, input.updateType),
			data: { screen: "horse", horseId: input.horseId },
			refId: input.memberPostId,
			imageUrl: firstPhotoUrl(horse?.photos),
		},
	});

	if (input.push === false) return;

	try {
		const delivery = await sendPush({
			organizationId: input.organizationId,
			triggerType: "HORSE_UPDATE",
			triggerRefId: input.memberPostId,
			title: input.title,
			body: pushBody(input.horseName, input.updateType),
			data: { screen: "horse", horseId: input.horseId },
			followersOfHorseId: input.horseId,
			badgeByUserId,
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
