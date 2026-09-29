import { isPublicSignupOpen } from "@repo/utils";

/**
 * S12-09 / D39: while public signup is closed the marketing site is a single
 * waitlist page. No nav, no footer, every other route redirects home. Flipping
 * NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN=true at launch brings the full site back.
 */
export function isWaitlistOnly(signupOpen: boolean = isPublicSignupOpen()): boolean {
	return !signupOpen;
}

/**
 * Routes that stay reachable in waitlist-only mode: the waitlist itself, the
 * shareable `/waitlist?src=…` and unsubscribe pages, and the legal pages the
 * consent checkbox links to (GDPR transparency).
 */
const WAITLIST_ONLY_ALLOWED = [/^\/$/, /^\/waitlist(?:\/unsubscribe)?\/?$/, /^\/legal\/.+/];

/** `pathname` may carry a locale prefix (`/de/legal/terms`); it is stripped first. */
export function isAllowedInWaitlistMode(pathname: string, locales: readonly string[]): boolean {
	const [, first, ...rest] = pathname.split("/");
	const path = first && locales.includes(first) ? `/${rest.join("/")}` : pathname;
	return WAITLIST_ONLY_ALLOWED.some((pattern) => pattern.test(path));
}
