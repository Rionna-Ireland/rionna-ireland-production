import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { CURRENT_AGE_CONFIRMATION_VERSION, CURRENT_TERMS_VERSION } from "@repo/utils";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import {
	AGE_CONFIRMATION_DOCUMENT,
	getAcceptedTermsVersion,
	hasConfirmedCurrentAge,
	LEGAL_ACCEPTANCE_SOURCES,
	resolveLegalOrganizationId,
	TERMS_DOCUMENT,
} from "../lib/terms";

/**
 * S12-10 A2/A3: records that the caller accepted the current Terms & Conditions
 * and confirmed they are 18 or over. Append-only: inserts a LegalAcceptance row
 * per document that is missing or stale; a no-op when both are already current.
 */
export const acceptTerms = protectedProcedure
	.route({
		method: "POST",
		path: "/legal/accept",
		tags: ["Legal"],
		summary: "Accept the current Terms & Conditions and confirm age 18+",
	})
	.input(
		z.object({
			version: z.string().min(1),
			over18: z.literal(true),
			source: z.enum(LEGAL_ACCEPTANCE_SOURCES),
		}),
	)
	.handler(async ({ input: { version, source }, context: { session, user } }) => {
		if (version !== CURRENT_TERMS_VERSION) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message:
					"These terms are out of date. Reload the page and accept the current terms.",
			});
		}

		const organizationId = await resolveLegalOrganizationId({
			userId: user.id,
			activeOrganizationId: session.activeOrganizationId,
		});

		if (!organizationId) {
			throw new ORPCError("BAD_REQUEST", { message: "No organization found" });
		}

		const [acceptedVersion, ageConfirmed] = await Promise.all([
			getAcceptedTermsVersion({ userId: user.id }),
			hasConfirmedCurrentAge({ userId: user.id }),
		]);

		const missing = [
			...(acceptedVersion === CURRENT_TERMS_VERSION
				? []
				: [{ document: TERMS_DOCUMENT, version: CURRENT_TERMS_VERSION }]),
			...(ageConfirmed
				? []
				: [
						{
							document: AGE_CONFIRMATION_DOCUMENT,
							version: CURRENT_AGE_CONFIRMATION_VERSION,
						},
					]),
		];

		if (missing.length === 0) {
			return { acceptedVersion: CURRENT_TERMS_VERSION, created: false };
		}

		await db.legalAcceptance.createMany({
			data: missing.map(({ document, version }) => ({
				userId: user.id,
				organizationId,
				document,
				version,
				source,
			})),
		});

		logger.info("Terms accepted", {
			event: "legal_terms_accepted",
			userId: user.id,
			organizationId,
			documents: missing.map(({ document }) => document),
			version: CURRENT_TERMS_VERSION,
			source,
		});

		return { acceptedVersion: CURRENT_TERMS_VERSION, created: true };
	});
