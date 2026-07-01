/**
 * Push notification audience targeting
 *
 * Finds Expo push tokens for organization members who have push enabled
 * and the relevant preference for the given trigger type.
 *
 * @see Architecture/specs/S2-04-push-notification-pipeline.md
 */

import { db } from "@repo/database";
import type { PushTriggerType } from "@repo/database";

export interface AudienceToken {
	expoPushToken: string;
	userId: string;
}

export interface AudienceRequest {
	organizationId: string;
	triggerType: PushTriggerType;
	targetUserId?: string;
	followersOfHorseId?: string;
}

/**
 * Map trigger type to the user preference key.
 * Returns null for SYSTEM pushes (they go to everyone).
 */
export function getPrefKey(triggerType: PushTriggerType): string | null {
	switch (triggerType) {
		case "HORSE_DECLARED":
		case "HORSE_NON_RUNNER":
			return "horseDeclared";
		case "RACE_RESULT":
			return "raceResult";
		case "TRAINER_POST":
			return "trainerPost";
		case "NEWS_POST":
			return "newsPost";
		case "CIRCLE_MENTION":
			return "circleMention";
		case "CIRCLE_REPLY":
			return "circleReply";
		case "CIRCLE_REACTION":
			return "circleReaction";
		case "CIRCLE_DM":
			return "circleDm";
		case "CIRCLE_HORSE_DISCUSSION":
			return "circleHorseDiscussion";
		case "SYSTEM":
			return null;
	}
}

export async function getAudienceTokens(
	request: AudienceRequest,
): Promise<AudienceToken[]> {
	const prefKey = getPrefKey(request.triggerType);

	const tokens = await db.pushToken.findMany({
		where: {
			user: {
				pushEnabled: true,
				members: {
					some: { organizationId: request.organizationId },
				},
				...(request.targetUserId ? { id: request.targetUserId } : {}),
			},
		},
		select: {
			expoPushToken: true,
			userId: true,
			user: { select: { pushPreferences: true } },
		},
	});

	const filteredTokens = tokens
		.filter((t) => {
			if (!prefKey) return true; // SYSTEM pushes go to everyone
			const prefs =
				(t.user.pushPreferences as Record<string, boolean>) ?? {};
			return prefs[prefKey] !== false; // Default true (opt-out model)
		})
		.map((t) => ({
			expoPushToken: t.expoPushToken,
			userId: t.userId,
		}));

	if (request.followersOfHorseId) {
		const follows = await db.horseFollow.findMany({
			where: {
				organizationId: request.organizationId,
				horseId: request.followersOfHorseId,
			},
			select: { userId: true },
		});
		const followerIds = new Set(follows.map((f) => f.userId));
		return filteredTokens.filter((t) => followerIds.has(t.userId));
	}

	return filteredTokens;
}
