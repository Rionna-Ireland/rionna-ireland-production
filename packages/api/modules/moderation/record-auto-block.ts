import { createModerationFlag } from "@repo/database";
import { logger } from "@repo/logs";

import type { CategoryScores, ModerationCategory } from "./auto-thresholds";
import { maybeEscalateMember } from "./escalate-member";
import { excerptOf } from "./excerpt";

/** S12-08: persist an auto-moderation block, then check escalation. Never throws. */
export async function recordAutoBlock(p: {
	organizationId: string;
	memberId: string;
	surface: "post" | "comment";
	text: string;
	categories: ModerationCategory[];
	scores: CategoryScores;
	targetPostId?: string;
	targetSpaceId?: string;
}): Promise<void> {
	logger.info("moderation.auto_blocked", {
		organizationId: p.organizationId,
		memberId: p.memberId,
		surface: p.surface,
		categories: p.categories,
		scores: p.scores,
	});
	try {
		await createModerationFlag({
			organizationId: p.organizationId,
			source: "auto",
			surface: p.surface,
			memberId: p.memberId,
			targetPostId: p.targetPostId ?? null,
			targetSpaceId: p.targetSpaceId ?? null,
			contentExcerpt: excerptOf(p.text),
			matchedTerms: p.categories,
			reason: JSON.stringify(p.scores),
		});
	} catch (error) {
		logger.warn("moderation.auto_block_record_failed", { organizationId: p.organizationId, error: String(error) });
	}
	await maybeEscalateMember({ organizationId: p.organizationId, memberId: p.memberId });
}
