import { createCharityConfig, getCurrentCharityConfig, updateCharityConfig } from "@repo/database";
import { logger } from "@repo/logs";

import { adminProcedure } from "../../../../orpc/procedures";
import { syncCharityRevenue } from "../../lib/sync-charity-revenue";
import { charityWriteInput, toCharityWriteData } from "./charity-input";

/** Create-or-update the org's current charity. A new row or a changed startDate re-syncs Stripe revenue. */
export const saveCharity = adminProcedure
	.route({ method: "POST", path: "/admin/charity/save", tags: ["Charity"], summary: "Save the current charity" })
	.input(charityWriteInput)
	.handler(async ({ input, context }) => {
		const { organizationId, ...rest } = input;
		const data = toCharityWriteData(rest);
		const current = await getCurrentCharityConfig({ organizationId });
		if (!current) {
			const config = await createCharityConfig({ organizationId, ...data });
			logger.info("Admin created charity config", { event: "admin_charity_config_created", actorUserId: context.user.id, organizationId, configId: config.id });
			await syncCharityRevenue({ organizationId });
			return { ok: true as const, config };
		}
		const startDateChanged = current.startDate.getTime() !== data.startDate.getTime();
		const config = await updateCharityConfig({ organizationId, configId: current.id, data });
		if (!config) return { ok: false as const, reason: "not_found" as const };
		logger.info("Admin updated charity config", { event: "admin_charity_config_updated", actorUserId: context.user.id, organizationId, configId: current.id });
		if (startDateChanged) await syncCharityRevenue({ organizationId });
		return { ok: true as const, config };
	});
