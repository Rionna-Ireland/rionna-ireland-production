import "server-only";
import { getTermsStatus } from "@repo/api/modules/legal/lib/terms";
import { redirect } from "next/navigation";
import { withQuery } from "ufo";

import { getSession } from "./server";

export const ACCEPT_TERMS_PATH = "/accept-terms";

/** Only same-origin absolute paths; anything else falls back to "/". */
export function safeRedirectPath(value: string | null | undefined): string {
	if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
		return "/";
	}
	return value;
}

/**
 * S12-10 A3: server-side T&C gate. Redirects to /accept-terms when the signed-in
 * user hasn't accepted the current terms version. `returnTo` is where the
 * accept page sends them afterwards (layouts don't know the pathname, so they
 * omit it and the user continues to "/").
 */
export async function requireTermsAccepted(returnTo?: string): Promise<void> {
	const session = await getSession();

	if (!session) {
		return;
	}

	const { needsAcceptance } = await getTermsStatus({
		userId: session.user.id,
		activeOrganizationId: session.session.activeOrganizationId,
	});

	if (needsAcceptance) {
		redirect(
			returnTo && returnTo !== "/"
				? withQuery(ACCEPT_TERMS_PATH, { redirectTo: safeRedirectPath(returnTo) })
				: ACCEPT_TERMS_PATH,
		);
	}
}
