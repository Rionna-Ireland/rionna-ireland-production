/**
 * Circle/Stripe Reconciliation Cron Endpoint
 *
 * Runs daily at 3:00 AM UTC via Vercel Cron.
 * Sweeps up any Circle provisioning or deactivation that the
 * Stripe webhook hot path missed.
 *
 * @see Architecture/specs/S1-06-reconciliation-cron.md
 */

import { isAuthorizedCronRequest } from "@repo/api/lib/cron-auth";
import {
	reconcileCircleHorseSpaces,
	reconcileCircleMembers,
} from "@repo/api/modules/circle/reconciliation";
import { db } from "@repo/database";
import { parseOrgMetadata } from "@repo/database/types";
import { logger } from "@repo/logs";

export async function POST(request: Request) {
	if (!isAuthorizedCronRequest(request)) {
		return new Response("Unauthorized", { status: 401 });
	}

	const orgs = await db.organization.findMany();
	const results: Record<
		string,
		{
			provisioned: number;
			deactivated: number;
			errors: number;
			horseSpacesProvisioned: number;
			horseSpaceErrors: number;
		}
	> = {};

	for (const org of orgs) {
		const metadata = parseOrgMetadata(org.metadata);
		if (!metadata.circle?.communityId) continue;

		const memberResult = await reconcileCircleMembers(org.id);
		const horseResult = await reconcileCircleHorseSpaces(org.id);
		const result = {
			...memberResult,
			horseSpacesProvisioned: horseResult.provisioned,
			horseSpaceErrors: horseResult.errors,
		};
		results[org.id] = result;

		logger.info("[Reconciliation Cron] Org complete", {
			orgId: org.id,
			...result,
		});
	}

	return Response.json({ ok: true, results });
}
