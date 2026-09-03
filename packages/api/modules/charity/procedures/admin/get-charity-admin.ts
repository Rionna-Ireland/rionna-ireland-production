import { getCurrentCharityConfig, listCharityHistory } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { computeTotalCents, toPercentageNumber } from "../../lib/charity-view";

export const getCharityAdmin = adminProcedure
	.route({ method: "GET", path: "/admin/charity", tags: ["Charity"], summary: "Charity config for admin" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input }) => {
		const [current, history] = await Promise.all([
			getCurrentCharityConfig({ organizationId: input.organizationId }),
			listCharityHistory({ organizationId: input.organizationId }),
		]);
		const computed = current
			? {
					revenueCents: current.stripeRevenueCents,
					computedTotalCents: computeTotalCents({
						stripeRevenueCents: current.stripeRevenueCents,
						percentage: toPercentageNumber(current.percentage),
						manualOverrideCents: null,
					}),
					syncedAt: current.revenueSyncedAt ? current.revenueSyncedAt.toISOString() : null,
				}
			: null;
		return { current, history, computed };
	});
