import { db } from "@repo/database";
import { logger } from "@repo/logs";

import { loadMemberEvents } from "./load-member-events";

export const FEATURED_QA_CTA = "Submit questions now";

/** S13-11: the Community tab's featured card — the soonest upcoming QA event. */
export interface FeaturedCard {
	kind: "qa";
	eventId: string;
	title: string;
	startsAt: string;
	cta: string;
}

/**
 * Soonest upcoming event typed QA, or null. Cheap when the club has no QA
 * events, or only past ones (one indexed sidecar query, no Circle call). Never throws: the featured
 * card is optional chrome and must not take the feed down.
 */
export async function getFeaturedQa(input: {
	organizationId: string;
	orgSlug: string;
	eventsSpaceId: string | number | undefined;
	userId: string;
	circleMemberId: string;
}): Promise<FeaturedCard | null> {
	if (!input.eventsSpaceId) return null;
	try {
		const qaRows = await db.clubEventMeta.findMany({
			where: {
				organizationId: input.organizationId,
				type: "QA",
				// Past events can't be featured; null = legacy row with unknown start.
				OR: [{ startsAt: null }, { startsAt: { gte: new Date() } }],
			},
			select: { circleEventId: true },
		});
		if (qaRows.length === 0) return null;
		const result = await loadMemberEvents({
			organizationId: input.organizationId,
			orgSlug: input.orgSlug,
			eventsSpaceId: input.eventsSpaceId,
			userId: input.userId,
			circleMemberId: input.circleMemberId,
			scope: "upcoming",
		});
		const next = result.events.find((e) => e.eventType === "QA" && e.startsAt !== null);
		if (!next?.startsAt) return null;
		return {
			kind: "qa",
			eventId: next.id,
			title: next.title,
			startsAt: next.startsAt,
			cta: FEATURED_QA_CTA,
		};
	} catch (error) {
		logger.warn("[Circle] featured Q&A lookup failed", {
			surface: "circle.member_feed",
			organizationId: input.organizationId,
			error: String(error),
		});
		return null;
	}
}
