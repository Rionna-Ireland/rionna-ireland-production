import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { CURRENT_TERMS_VERSION } from "@repo/utils";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import {
	getAcceptedTermsVersion,
	LEGAL_ACCEPTANCE_SOURCES,
	resolveLegalOrganizationId,
	TERMS_DOCUMENT,
} from "../lib/terms";

/**
 * S12-10 A2/A3: records that the caller accepted the current Terms & Conditions.
 * Append-only: inserts a LegalAcceptance row; a no-op when the latest row for
 * the org already matches the current version.
 */
export const acceptTerms = protectedProcedure
	.route({
		method: "POST",
		path: "/legal/accept",
		tags: ["Legal"],
		summary: "Accept the current Terms & Conditions",
	})
	.input(
		z.object({
			version: z.string().min(1),
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

		const acceptedVersion = await getAcceptedTermsVersion({ userId: user.id });

		if (acceptedVersion === CURRENT_TERMS_VERSION) {
			return { acceptedVersion, created: false };
		}

		await db.legalAcceptance.create({
			data: {
				userId: user.id,
				organizationId,
				document: TERMS_DOCUMENT,
				version: CURRENT_TERMS_VERSION,
				source,
			},
		});

		logger.info("Terms accepted", {
			event: "legal_terms_accepted",
			userId: user.id,
			organizationId,
			version: CURRENT_TERMS_VERSION,
			source,
		});

		return { acceptedVersion: CURRENT_TERMS_VERSION, created: true };
	});
