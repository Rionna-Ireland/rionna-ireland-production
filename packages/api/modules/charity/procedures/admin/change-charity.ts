import { createCharityConfig, endCharityConfig, getCurrentCharityConfig } from "@repo/database";
import { logger } from "@repo/logs";

import { adminProcedure } from "../../../../orpc/procedures";
import { syncCharityRevenue } from "../../lib/sync-charity-revenue";
import { charityWriteInput, toCharityWriteData } from "./charity-input";

/** Ends the current charity (history) and starts a new one (S12-01 decision 3). */
export const changeCharity = adminProcedure
	.route({ method: "POST", path: "/admin/charity/change", tags: ["Charity"], summary: "Change the current charity" })
	.input(charityWriteInput)
	.handler(async ({ input, context }) => {
		const { organizationId, ...rest } = input;
		const data = toCharityWriteData(rest);
		const current = await getCurrentCharityConfig({ organizationId });
		if (current) {
			await endCharityConfig({ organizationId, configId: current.id, endedAt: new Date() });
		}
		const config = await createCharityConfig({ organizationId, ...data });
		logger.info("Admin changed charity", {
			event: "admin_charity_changed",
			actorUserId: context.user.id,
			organizationId,
			previousConfigId: current?.id ?? null,
			configId: config.id,
		});
		await syncCharityRevenue({ organizationId });
		return { ok: true as const, config };
	});
