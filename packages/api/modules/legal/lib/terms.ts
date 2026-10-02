import { db } from "@repo/database";
import { CURRENT_AGE_CONFIRMATION_VERSION, CURRENT_TERMS_VERSION } from "@repo/utils";

/** S12-10: the Terms & Conditions document (decision 5). */
export const TERMS_DOCUMENT = "terms";

/** The "I confirm I am 18 or over" statement, accepted alongside the terms. */
export const AGE_CONFIRMATION_DOCUMENT = "age_confirmation";

export const LEGAL_ACCEPTANCE_SOURCES = ["web_signup", "web_prompt", "mobile_prompt"] as const;
export type LegalAcceptanceSource = (typeof LEGAL_ACCEPTANCE_SOURCES)[number];

export interface TermsStatus {
	currentVersion: string;
	acceptedVersion: string | null;
	ageConfirmed: boolean;
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
 * disagree. They all read the same thing — the user's latest acceptance of
 * each document, whichever org row it was recorded against — so a user who
 * passed the gate can always check out, and vice versa. The org is still
 * resolved (resolveLegalOrganizationId) when *recording* an acceptance.
 */

async function getLatestAcceptedVersion({
	userId,
	document,
}: {
	userId: string;
	document: string;
}): Promise<string | null> {
	const latest = await db.legalAcceptance.findFirst({
		where: { userId, document },
		orderBy: { acceptedAt: "desc" },
		select: { version: true },
	});

	return latest?.version ?? null;
}

/** Latest terms version the user accepted (any org, see above), or null. */
export async function getAcceptedTermsVersion({
	userId,
}: {
	userId: string;
}): Promise<string | null> {
	return getLatestAcceptedVersion({ userId, document: TERMS_DOCUMENT });
}

/** True when the user's latest age confirmation is the current version. */
export async function hasConfirmedCurrentAge({ userId }: { userId: string }): Promise<boolean> {
	const version = await getLatestAcceptedVersion({
		userId,
		document: AGE_CONFIRMATION_DOCUMENT,
	});

	return version === CURRENT_AGE_CONFIRMATION_VERSION;
}

/**
 * Whether the user must (re-)accept: either the current terms or the 18+
 * confirmation is missing. Both are asked for together on one screen.
 */
export async function getTermsStatus({ userId }: { userId: string }): Promise<TermsStatus> {
	const [acceptedVersion, ageConfirmed] = await Promise.all([
		getAcceptedTermsVersion({ userId }),
		hasConfirmedCurrentAge({ userId }),
	]);

	return {
		currentVersion: CURRENT_TERMS_VERSION,
		acceptedVersion,
		ageConfirmed,
		needsAcceptance: acceptedVersion !== CURRENT_TERMS_VERSION || !ageConfirmed,
	};
}

/**
 * True when the user has accepted the CURRENT terms and confirmed they are 18+
 * — the exact inverse of `getTermsStatus().needsAcceptance`. Used by the
 * checkout guard.
 */
export async function hasAcceptedCurrentTerms({ userId }: { userId: string }): Promise<boolean> {
	return (await getTermsStatus({ userId })).needsAcceptance === false;
}
