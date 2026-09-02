import { claimPollNotification, releasePollNotification } from "@repo/database";
import { logger } from "@repo/logs";

import { sendPush } from "../../push/service";

export interface NotifyPollPublishedInput {
	organizationId: string;
	pollId: string;
	question: string;
	scope: "club" | "space";
	/** Space-scope only: the horse whose followers should get the push. */
	followersOfHorseId?: string;
}

/**
 * POLL push on admin publish. Club-scope polls push org-wide with a `poll`
 * deep link (the mobile poll screen only knows club-scope polls). Space-scope
 * polls push only to the horse's followers with a `community` deep link
 * instead — the mobile poll screen would otherwise 404 the poll — and are
 * skipped entirely (with a warn, never an org-wide fallback) when no horse
 * resolves. The atomic claim on Poll.notifiedAt is taken only once a push
 * will actually be attempted, so concurrent publishes can't double-send;
 * it is released on total delivery failure or a throw so a re-publish can
 * retry. Never throws.
 */
export async function notifyPollPublished(input: NotifyPollPublishedInput): Promise<void> {
	if (input.scope === "space" && !input.followersOfHorseId) {
		logger.warn("[Polls] space poll published with no horse resolved; skipping push", {
			organizationId: input.organizationId,
			pollId: input.pollId,
		});
		return;
	}
	let claimed: boolean;
	try {
		claimed = await claimPollNotification(input.pollId);
	} catch (error) {
		logger.error("[Polls] publish notify claim threw", {
			pollId: input.pollId,
			error: String(error),
		});
		return;
	}
	if (!claimed) return;
	try {
		const delivery = await sendPush({
			organizationId: input.organizationId,
			triggerType: "POLL",
			triggerRefId: input.pollId,
			title: `New vote: ${input.question}`,
			body: "Tap to have your say.",
			...(input.scope === "space"
				? { followersOfHorseId: input.followersOfHorseId, data: { screen: "community" } }
				: { data: { screen: "poll", pollId: input.pollId } }),
		});
		logger.info("[Polls] publish notify summary", { pollId: input.pollId, ...delivery });
		if (delivery.attempted > 0 && delivery.sent === 0) {
			await releasePollNotification(input.pollId);
		}
	} catch (error) {
		logger.error("[Polls] publish notify threw", {
			pollId: input.pollId,
			error: String(error),
		});
		await releasePollNotification(input.pollId);
	}
}
