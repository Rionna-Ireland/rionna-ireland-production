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

/** Latest terms version the user accepted for the org, or null. */
export async function getAcceptedTermsVersion({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string;
}): Promise<string | null> {
	const latest = await db.legalAcceptance.findFirst({
		where: { userId, organizationId, document: TERMS_DOCUMENT },
		orderBy: { acceptedAt: "desc" },
		select: { version: true },
	});

	return latest?.version ?? null;
}

export async function getTermsStatus({
	userId,
	activeOrganizationId,
}: {
	userId: string;
	activeOrganizationId?: string | null;
}): Promise<TermsStatus> {
	const organizationId = await resolveLegalOrganizationId({ userId, activeOrganizationId });
	const acceptedVersion = organizationId
		? await getAcceptedTermsVersion({ userId, organizationId })
		: null;

	return {
		currentVersion: CURRENT_TERMS_VERSION,
		acceptedVersion,
		needsAcceptance: acceptedVersion !== CURRENT_TERMS_VERSION,
	};
}

/**
 * True when the user has a LegalAcceptance row for the CURRENT terms version —
 * scoped to `organizationId` when given (the org being checked out). Used by
 * the checkout guard.
 */
export async function hasAcceptedCurrentTerms({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId?: string | null;
}): Promise<boolean> {
	const row = await db.legalAcceptance.findFirst({
		where: {
			userId,
			document: TERMS_DOCUMENT,
			version: CURRENT_TERMS_VERSION,
			...(organizationId ? { organizationId } : {}),
		},
		select: { id: true },
	});

	return row !== null;
}
