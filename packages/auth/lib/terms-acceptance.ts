import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { CURRENT_TERMS_VERSION } from "@repo/utils";
import { APIError } from "better-auth/api";

export const TERMS_NOT_ACCEPTED_ERROR_CODE = "TERMS_NOT_ACCEPTED";

export const SIGNUP_PATH = "/sign-up/email";

function readAcceptedVersion(body: unknown): unknown {
	return body && typeof body === "object" && "acceptedTermsVersion" in body
		? body.acceptedTermsVersion
		: undefined;
}

/** True when the sign-up body carries the CURRENT terms version. */
export function hasAcceptedCurrentTermsInBody(body: unknown): boolean {
	return readAcceptedVersion(body) === CURRENT_TERMS_VERSION;
}

/**
 * S12-10: throws a BAD_REQUEST `APIError` unless the sign-up request carries
 * `acceptedTermsVersion === CURRENT_TERMS_VERSION`. Runs in `hooks.before`, so
 * nothing is created for a refused sign-up.
 */
export function assertTermsAccepted(body: unknown): void {
	if (hasAcceptedCurrentTermsInBody(body)) {
		return;
	}

	throw new APIError("BAD_REQUEST", {
		code: TERMS_NOT_ACCEPTED_ERROR_CODE,
		message: "You must accept the current Terms and Conditions to sign up.",
	});
}

/**
 * Records the signup-time terms acceptance (source "web_signup") for a freshly
 * created user. The user has no membership yet, so the row goes against the
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

		await db.legalAcceptance.create({
			data: {
				userId,
				organizationId: club.id,
				document: "terms",
				version: CURRENT_TERMS_VERSION,
				source: "web_signup",
			},
		});
	} catch (error) {
		logger.error(error, { ctx: "recordSignupTermsAcceptance", userId });
	}
}
