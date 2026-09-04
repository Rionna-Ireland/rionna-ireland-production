/** Collapses whitespace, trims, and slices to `max` chars (default 200), appending an ellipsis when truncated. */
export function excerptOf(text: string, max = 200): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}
