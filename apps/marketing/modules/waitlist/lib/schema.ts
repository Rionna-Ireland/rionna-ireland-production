import { z } from "zod";

/**
 * S12-09 waitlist form schema, shared by the client form (react-hook-form)
 * and the `joinWaitlist` server action. Messages are error *codes*; the client
 * passes a translator so users see copy, the server returns the codes.
 */

export const WAITLIST_NAME_MAX = 80;
export const WAITLIST_EMAIL_MAX = 254;
export const WAITLIST_SOURCE_MAX = 64;

/**
 * Hidden honeypot input. Real users never see or fill it; a non-empty value
 * means a bot, which gets a fake success and nothing is written.
 */
export const WAITLIST_HONEYPOT_FIELD = "website_url";

export const WAITLIST_ERROR_CODES = [
	"firstNameRequired",
	"firstNameTooLong",
	"lastNameRequired",
	"lastNameTooLong",
	"emailRequired",
	"emailInvalid",
	"consentRequired",
] as const;

export type WaitlistErrorCode = (typeof WAITLIST_ERROR_CODES)[number];

export type WaitlistField = "firstName" | "lastName" | "email" | "consent";

export function createWaitlistFieldsSchema(
	message: (code: WaitlistErrorCode) => string = (code) => code,
) {
	return z.object({
		firstName: z
			.string(message("firstNameRequired"))
			.trim()
			.min(1, message("firstNameRequired"))
			.max(WAITLIST_NAME_MAX, message("firstNameTooLong")),
		lastName: z
			.string(message("lastNameRequired"))
			.trim()
			.min(1, message("lastNameRequired"))
			.max(WAITLIST_NAME_MAX, message("lastNameTooLong")),
		email: z
			.string(message("emailRequired"))
			.trim()
			.toLowerCase()
			.min(1, message("emailRequired"))
			.max(WAITLIST_EMAIL_MAX, message("emailInvalid"))
			.pipe(z.email(message("emailInvalid"))),
		consent: z
			.boolean(message("consentRequired"))
			.refine((value) => value === true, message("consentRequired")),
	});
}

export function isWaitlistErrorCode(value: unknown): value is WaitlistErrorCode {
	return typeof value === "string" && (WAITLIST_ERROR_CODES as readonly string[]).includes(value);
}

export function isHoneypotFilled(value: unknown): boolean {
	return typeof value === "string" ? value.trim().length > 0 : value != null;
}

/**
 * `?src=` tag → a short, safe attribution label (e.g. "race-day", "press"),
 * or null. Never rejects a signup: bad input is cleaned, not refused.
 */
export function sanitizeSource(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const cleaned = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, WAITLIST_SOURCE_MAX)
		.replace(/-+$/g, "");

	return cleaned.length > 0 ? cleaned : null;
}

/** Unsubscribe tokens are base64url (randomBytes(32) → 43 chars). */
export function isPlausibleUnsubscribeToken(value: unknown): value is string {
	return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}
