import { ORPCError } from "@orpc/client";
import { getBaseUrl } from "@repo/utils";

/**
 * Validates a client-supplied redirect URL before it is handed to Stripe as a
 * checkout `success_url` or billing-portal `return_url`.
 *
 * Stripe will bounce the authenticated user to whatever URL we pass, so an
 * unvalidated value is an open-redirect / phishing vector. We resolve the input
 * against the app's own origin and reject anything that lands on a different
 * origin. Relative paths are allowed and normalised to an absolute URL (Stripe
 * requires absolute URLs).
 *
 * Returns `undefined` when no redirect URL was supplied.
 */
export function resolveSafeRedirectUrl(
	redirectUrl: string | undefined,
): string | undefined {
	if (!redirectUrl) {
		return undefined;
	}

	const appOrigin = new URL(getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL)).origin;

	let target: URL;
	try {
		target = new URL(redirectUrl, appOrigin);
	} catch {
		throw new ORPCError("BAD_REQUEST", { message: "Invalid redirect URL." });
	}

	if (target.origin !== appOrigin) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Redirect URL must be on the same origin as the application.",
		});
	}

	return target.toString();
}
