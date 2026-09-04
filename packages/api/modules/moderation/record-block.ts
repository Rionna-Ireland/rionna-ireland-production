import { createModerationFlag } from "@repo/database";
import { logger } from "@repo/logs";

import { excerptOf } from "./excerpt";

export async function recordBlock(p: {
	organizationId: string;
	memberId: string;
	surface: "post" | "comment";
	text: string;
	matches: string[];
	targetPostId?: string;
	targetSpaceId?: string;
}): Promise<void> {
	logger.info("moderation.blocked", {
		organizationId: p.organizationId,
		memberId: p.memberId,
		surface: p.surface,
		matches: p.matches,
	});
	try {
		await createModerationFlag({
			organizationId: p.organizationId,
			source: "blocked",
			surface: p.surface,
			memberId: p.memberId,
			targetPostId: p.targetPostId ?? null,
			targetSpaceId: p.targetSpaceId ?? null,
			contentExcerpt: excerptOf(p.text),
			matchedTerms: p.matches,
		});
	} catch (error) {
		logger.warn("moderation.block_record_failed", {
			organizationId: p.organizationId,
			error: String(error),
		});
	}
}
