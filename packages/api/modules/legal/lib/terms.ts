import { db } from "@repo/database";
import { CURRENT_TERMS_VERSION } from "@repo/utils";

/** S12-10: the only document recorded today (decision 5). */
export const TERMS_DOCUMENT = "terms";

export const LEGAL_ACCEPTANCE_SOURCES = ["web_signup", "web_prompt", "mobile_prompt"] as const;
export type LegalAcceptanceSource = (typeof LEGAL_ACCEPTANCE_SOURCES)[number];

export interface TermsStatus {
	currentVersion: string;
	acceptedVersion: string | null;
	needsAcceptance: boolean;
}

/**
 * Resolves the org a legal acceptance is recorded against. Session active org
 * first (mobile, impersonation); web sessions often carry none, so fall back to
 * the user's own membership, then to the single club org (D37) — a new signup
 * accepts the terms before the Stripe webhook creates their Member row.
 */
export async function resolveLegalOrganizationId({
	userId,
	activeOrganizationId,
}: {
	userId: string;
	activeOrganizationId?: string | null;
}): Promise<string | null> {
	if (activeOrganizationId) {
		return activeOrganizationId;
	}

	const membership = await db.member.findFirst({
		where: { userId },
		orderBy: { createdAt: "asc" },
		select: { organizationId: true },
	});

	if (membership) {
		return membership.organizationId;
	}

	const club = await db.organization.findFirst({
		orderBy: { createdAt: "asc" },
		select: { id: true },
	});

	return club?.id ?? null;
}

/*
 * Checking acceptance is deliberately org-agnostic: Rionna is a single club
 * (D37), and the `/accept-terms` gate (getTermsStatus), `legal.accept`
 * idempotency and the checkout guard (hasAcceptedCurrentTerms) must never
 * disagree. They all read the same thing — the user's latest terms
 * acceptance, whichever org row it was recorded against — so a user who
 * passed the gate can always check out, and vice versa. The org is still
 * resolved (resolveLegalOrganizationId) when *recording* an acceptance.
 */

/** Latest terms version the user accepted (any org, see above), or null. */
export async function getAcceptedTermsVersion({
	userId,
}: {
	userId: string;
}): Promise<string | null> {
	const latest = await db.legalAcceptance.findFirst({
		where: { userId, document: TERMS_DOCUMENT },
		orderBy: { acceptedAt: "desc" },
		select: { version: true },
	});

	return latest?.version ?? null;
}

export async function getTermsStatus({ userId }: { userId: string }): Promise<TermsStatus> {
	const acceptedVersion = await getAcceptedTermsVersion({ userId });

	return {
		currentVersion: CURRENT_TERMS_VERSION,
		acceptedVersion,
		needsAcceptance: acceptedVersion !== CURRENT_TERMS_VERSION,
	};
}

/**
 * True when the user's latest acceptance is the CURRENT terms version — the
 * exact inverse of `getTermsStatus().needsAcceptance`. Used by the checkout
 * guard.
 */
export async function hasAcceptedCurrentTerms({ userId }: { userId: string }): Promise<boolean> {
	return (await getTermsStatus({ userId })).needsAcceptance === false;
}
