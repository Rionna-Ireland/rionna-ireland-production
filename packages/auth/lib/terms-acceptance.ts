import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { CURRENT_AGE_CONFIRMATION_VERSION, CURRENT_TERMS_VERSION } from "@repo/utils";
import { APIError } from "better-auth/api";

export const TERMS_NOT_ACCEPTED_ERROR_CODE = "TERMS_NOT_ACCEPTED";

export const SIGNUP_PATH = "/sign-up/email";

function readAcceptedVersion(body: unknown): unknown {
	return body && typeof body === "object" && "acceptedTermsVersion" in body
		? body.acceptedTermsVersion
		: undefined;
}

function readConfirmedOver18(body: unknown): unknown {
	return body && typeof body === "object" && "confirmedOver18" in body
		? body.confirmedOver18
		: undefined;
}

/**
 * True when the sign-up body carries the CURRENT terms version and
 * `confirmedOver18: true`.
 */
export function hasAcceptedCurrentTermsInBody(body: unknown): boolean {
	return (
		readAcceptedVersion(body) === CURRENT_TERMS_VERSION && readConfirmedOver18(body) === true
	);
}

/**
 * S12-10: throws a BAD_REQUEST `APIError` unless the sign-up request carries
 * `acceptedTermsVersion === CURRENT_TERMS_VERSION` and `confirmedOver18: true`. Runs in `hooks.before`, so
 * nothing is created for a refused sign-up.
 */
export function assertTermsAccepted(body: unknown): void {
	if (hasAcceptedCurrentTermsInBody(body)) {
		return;
	}

	throw new APIError("BAD_REQUEST", {
		code: TERMS_NOT_ACCEPTED_ERROR_CODE,
		message:
			"You must confirm you are 18 or over and accept the current Terms and Conditions to sign up.",
	});
}

/**
 * Records the signup-time terms acceptance and 18+ confirmation (source
 * "web_signup") for a freshly created user. The user has no membership yet, so the row goes against the
 * single club org (D37): first organization by createdAt. This mirrors the
 * fallback in `resolveLegalOrganizationId` (packages/api/modules/legal/lib/terms.ts),
 * duplicated here because packages/auth cannot import from packages/api.
 *
 * Never throws: a failure only means the `/accept-terms` gate asks again.
 */
export async function recordSignupTermsAcceptance(userId: string): Promise<void> {
	try {
		const club = await db.organization.findFirst({
			orderBy: { createdAt: "asc" },
			select: { id: true },
		});

		if (!club) {
			logger.warn("Signup terms acceptance skipped: no organization", { userId });
			return;
		}

		// Document names mirror TERMS_DOCUMENT / AGE_CONFIRMATION_DOCUMENT in
		// packages/api/modules/legal/lib/terms.ts.
		await db.legalAcceptance.createMany({
			data: [
				{ document: "terms", version: CURRENT_TERMS_VERSION },
				{ document: "age_confirmation", version: CURRENT_AGE_CONFIRMATION_VERSION },
			].map(({ document, version }) => ({
				userId,
				organizationId: club.id,
				document,
				version,
				source: "web_signup",
			})),
		});
	} catch (error) {
		logger.error(error, { ctx: "recordSignupTermsAcceptance", userId });
	}
}
