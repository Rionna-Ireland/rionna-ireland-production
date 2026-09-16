/**
 * S12-08 per-category block thresholds for OpenAI omni-moderation-latest.
 * Set from the S12-07 probe (2026-09-16, "safe" set — 0/60 legit racing lines
 * blocked, 20/40 abusive blocked). OpenAI's own `flagged` is NOT used: it
 * blocked 19/60 legit lines ("had to be put down", "you eejit").
 * harassment / violence / illicit sit high because racing banter scores up to
 * 0.84 / 0.92 / 0.68. Tune from `moderation.auto_near_miss` logs; the probe
 * fixture tests must keep passing.
 */
export const MODERATION_CATEGORIES = [
	"harassment",
	"harassment/threatening",
	"hate",
	"hate/threatening",
	"illicit",
	"illicit/violent",
	"self-harm",
	"self-harm/intent",
	"self-harm/instructions",
	"sexual",
	"sexual/minors",
	"violence",
	"violence/graphic",
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];
export type CategoryScores = Partial<Record<ModerationCategory, number>>;

export const AUTO_MODERATION_THRESHOLDS: Record<ModerationCategory, number> = {
	harassment: 0.9,
	"harassment/threatening": 0.6,
	hate: 0.4,
	"hate/threatening": 0.15,
	illicit: 0.75,
	"illicit/violent": 0.3,
	"self-harm": 0.65,
	"self-harm/intent": 0.3,
	"self-harm/instructions": 0.3,
	sexual: 0.3,
	"sexual/minors": 0.1,
	violence: 0.95,
	"violence/graphic": 0.45,
};

/** A sub-threshold score at or above this is logged as a near-miss for tuning. */
export const NEAR_MISS_SCORE = 0.5;

/** Categories whose score meets or exceeds its block threshold. */
export function trippedCategories(scores: CategoryScores): ModerationCategory[] {
	return MODERATION_CATEGORIES.filter((c) => (scores[c] ?? 0) >= AUTO_MODERATION_THRESHOLDS[c]);
}

/** Categories scoring ≥ NEAR_MISS_SCORE that did not block. */
export function nearMissCategories(scores: CategoryScores): ModerationCategory[] {
	return MODERATION_CATEGORIES.filter((c) => {
		const s = scores[c] ?? 0;
		return s >= NEAR_MISS_SCORE && s < AUTO_MODERATION_THRESHOLDS[c];
	});
}
