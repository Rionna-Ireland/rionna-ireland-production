/** Per-word stagger (ms): 60ms, tightened so the last word's 700ms rise ends by 900ms (100ms start). */
export function heroWordStepMs(wordCount: number): number {
	return wordCount <= 1 ? 0 : Math.min(60, Math.floor(100 / (wordCount - 1)));
}
