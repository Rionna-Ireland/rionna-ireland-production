import { db } from "@repo/database";
import { logger } from "@repo/logs";
import type { createCircleService } from "@repo/payments/lib/circle";

import { clearMemberFeedCache } from "../../circle/lib/member-feed-cache";
import { descriptionToTiptap } from "./description-to-tiptap";

type Meta = { type?: string; questionsPostId?: string | null } | null | undefined;

/**
 * QA events get a companion Circle post in the Q&A space (announcements as fallback); members
 * submit questions as comments on it. Never throws: the event is already
 * committed in Circle, so a failure here is logged and the next update retries.
 */
export async function ensureQuestionsPost(input: {
	organizationId: string;
	circleEventId: string;
	eventName: string;
	startsAt?: string;
	circle: Pick<ReturnType<typeof createCircleService>, "createPost">;
	/** Sidecar row if the caller just wrote it; otherwise it is read here. */
	meta?: Meta;
	communitySpaceId?: string;
	/** S13-18: preferred home for questions threads. */
	qaSpaceId?: string;
}): Promise<void> {
	try {
		const meta =
			input.meta ??
			(await db.clubEventMeta.findUnique({
				where: { circleEventId: input.circleEventId },
				select: { type: true, questionsPostId: true },
			}));
		if (meta?.type !== "QA" || meta.questionsPostId) return;
		const spaceId = input.qaSpaceId ?? input.communitySpaceId;
		if (!spaceId) return;
		const when = input.startsAt
			? new Date(input.startsAt).toLocaleDateString("en-IE", {
					weekday: "long",
					day: "numeric",
					month: "long",
					timeZone: "Europe/Dublin",
				})
			: null;
		const created = await input.circle.createPost({
			spaceId,
			name: `Questions for the Live Q&A: ${input.eventName}`,
			tiptapBody: descriptionToTiptap(
				`Drop your questions below and we'll put them to the team${when ? ` on ${when}` : ""}.`,
			),
			skipNotifications: true,
			idempotencyKey: `qa-questions-${input.circleEventId}`,
		});
		if (!created.ok) {
			logger.warn("[Events] questions post create failed", {
				circleEventId: input.circleEventId,
				reason: created.reason,
			});
			return;
		}
		await db.clubEventMeta.update({
			where: { circleEventId: input.circleEventId },
			data: { questionsPostId: created.data.circlePostId, questionsSpaceId: spaceId },
		});
		clearMemberFeedCache();
	} catch (error) {
		logger.error("[Events] questions post failed", { circleEventId: input.circleEventId, error });
	}
}
