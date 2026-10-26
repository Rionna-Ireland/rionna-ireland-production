export interface FaqItem {
	question: string;
	answer: string;
}

/** Admin items win; the translated fallback is only built when none are set. */
export const pickItems = <T>(admin: T[], fallback: () => T[]): T[] =>
	admin.length > 0 ? admin : fallback();
