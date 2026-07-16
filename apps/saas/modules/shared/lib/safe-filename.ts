/**
 * Coerce a user-supplied filename into the API's SAFE_FILENAME shape
 * (/^[\w][\w.\-]{0,120}$/, see packages/api/lib/upload-validation.ts). Capped at
 * 100 chars so call sites can prepend a `${Date.now()}-` prefix and stay within
 * the server's 121-char limit.
 */
export function toSafeFilename(name: string): string {
	const cleaned = name
		.replace(/[^\w.-]+/g, "-")
		.replace(/^[^\w]+/, "")
		.slice(0, 100);
	return cleaned || "file";
}
