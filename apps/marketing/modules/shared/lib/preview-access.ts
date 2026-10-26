/**
 * Client preview of the full site on the waitlist domain. Unlocked by
 * MARKETING_PREVIEW_PASSWORD (unset = no preview). The cookie holds a hash of
 * the password, so rotating the password locks out every old cookie.
 */
export const PREVIEW_COOKIE = "rionna-preview";
export const PREVIEW_MAX_AGE = 60 * 60 * 24 * 30;

export async function previewToken(password: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`rionna-preview:${password}`),
	);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hasPreviewAccess(
	cookieValue: string | undefined,
	password: string | undefined = process.env.MARKETING_PREVIEW_PASSWORD,
): Promise<boolean> {
	if (!password || !cookieValue) return false;
	return cookieValue === (await previewToken(password));
}
