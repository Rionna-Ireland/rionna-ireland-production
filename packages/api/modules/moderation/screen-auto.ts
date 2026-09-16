import { logger } from "@repo/logs";

import { type CategoryScores, type ModerationCategory, nearMissCategories, trippedCategories } from "./auto-thresholds";
import { classifyText } from "./openai-moderation";

export type AutoScreenResult =
	| { allowed: true }
	| { allowed: false; categories: ModerationCategory[]; scores: CategoryScores };

interface ScreenContext {
	organizationId: string;
	memberId: string;
	surface: "post" | "comment";
}

function pick(scores: CategoryScores, categories: ModerationCategory[]): CategoryScores {
	return Object.fromEntries(categories.map((c) => [c, scores[c] ?? 0]));
}

/**
 * S12-08 auto-moderation. Runs after the word gate. Fails OPEN on any
 * classifier problem (decision 7). Never logs member text.
 */
export async function screenAuto(text: string, ctx: ScreenContext): Promise<AutoScreenResult> {
	if (!text.trim()) return { allowed: true };

	let result: Awaited<ReturnType<typeof classifyText>>;
	try {
		result = await classifyText(text);
	} catch {
		logger.warn("moderation.auto_unavailable", { ...ctx, reason: "exception" });
		return { allowed: true };
	}

	if (!result.ok) {
		logger.warn("moderation.auto_unavailable", {
			...ctx,
			reason: result.reason,
			...(result.status ? { status: result.status } : {}),
		});
		return { allowed: true };
	}

	const tripped = trippedCategories(result.scores);
	if (tripped.length > 0) {
		return { allowed: false, categories: tripped, scores: pick(result.scores, tripped) };
	}

	const near = nearMissCategories(result.scores);
	if (near.length > 0) {
		logger.info("moderation.auto_near_miss", { ...ctx, scores: pick(result.scores, near) });
	}
	return { allowed: true };
}
