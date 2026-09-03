import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { syncCharityRevenue } from "../../lib/sync-charity-revenue";

export const recalculateCharity = adminProcedure
	.route({ method: "POST", path: "/admin/charity/recalculate", tags: ["Charity"], summary: "Recalculate Stripe revenue now" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context }) => {
		const result = await syncCharityRevenue({ organizationId: input.organizationId });
		if (!result.ok) return { ok: false as const, reason: result.reason };
		logger.info("Admin recalculated charity revenue", {
			event: "admin_charity_revenue_recalculated",
			actorUserId: context.user.id,
			organizationId: input.organizationId,
			configId: result.configId,
			stripeRevenueCents: result.stripeRevenueCents,
		});
		return { ok: true as const, revenueCents: result.stripeRevenueCents, syncedAt: result.syncedAt.toISOString() };
	});
